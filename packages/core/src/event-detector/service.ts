import { GoogleGenAI } from "@google/genai";
import { getLogger } from "@logtape/logtape";
import { nanoid } from "nanoid";
import { OpenAI } from "openai";
import type { z } from "zod/v4";
import type { ApiKeys } from "../config.js";
import { zodGeminiFormat, zodResponseFormat } from "../lib/zod4-schema.js";
import type { Event, EventType, Turn } from "../type.js";
import {
  buildUserPrompt,
  type DetectedEventSchema,
  EventAnalysisSchema,
  type EventDetectorConfig,
  systemPrompt,
} from "./def.js";

type RequestOptions = {
  signal?: AbortSignal;
};

export class EventDetector {
  private lastEventTime: Map<EventType, number> = new Map();

  private logger = getLogger(["ai-reaction", "event-detector"]);

  constructor(
    private config: EventDetectorConfig,
    private apiKeys: ApiKeys,
  ) {}

  async detect(
    {
      turn,
      uncommentedText,
      fullContext,
    }: { turn: Turn; uncommentedText: string; fullContext?: string },
    { signal }: RequestOptions = {},
  ): Promise<Event[]> {
    const events: Event[] = [];
    const now = turn.endTime;
    const contextForDetection = fullContext || uncommentedText;

    this.logger.debug("Starting AI event detection", () => ({
      turnId: turn.id,
      turnContentLength: turn.content?.length ?? 0,
      uncommentedTextLength: uncommentedText.length,
      fullContextLength: contextForDetection.length,
      modelProvider: this.config.modelProvider,
      model: this.config.model,
      timestamp: now,
    }));

    const detectionStart = performance.now();
    try {
      // AI-powered event detection using uncommented text for better context
      const aiEvents = await this.detectWithAI(
        {
          content: turn.content,
          uncommentedText,
          fullContext: contextForDetection,
          timestamp: now,
        },
        { signal },
      );

      const detectionTimeMs = performance.now() - detectionStart;

      for (const aiEvent of aiEvents) {
        events.push(aiEvent);
        this.lastEventTime.set(aiEvent.type, now);
      }

      this.logger.info("AI event detection completed", {
        turnId: turn.id,
        detectionTimeMs: Math.round(detectionTimeMs),
        totalEvents: events.length,
        eventTypes: events.map((e) => e.type),
        avgConfidence:
          events.length > 0
            ? parseFloat(
                (
                  events.reduce((sum, e) => sum + e.confidence, 0) /
                  events.length
                ).toFixed(2),
              )
            : 0,
      });

      return events;
    } catch (error) {
      const detectionTimeMs = performance.now() - detectionStart;
      this.logger.error("AI event detection failed: {message}", {
        message: (error as Error)?.message,
        name: (error as Error)?.name,
        turnId: turn.id,
        detectionTimeMs: Math.round(detectionTimeMs),
        modelProvider: this.config.modelProvider,
        stack: (error as Error)?.stack,
      });
      throw error;
    }
  }

  private async detectWithAI(
    {
      content,
      uncommentedText,
      fullContext,
      timestamp,
    }: {
      content: string;
      uncommentedText: string;
      fullContext: string;
      timestamp: number;
    },
    { signal }: RequestOptions,
  ) {
    const immediateContext = uncommentedText;
    const broadContext = fullContext.slice(-1500);
    const userPrompt = buildUserPrompt(immediateContext, broadContext, content);
    const provider = this.config.modelProvider;

    this.logger.debug("Preparing AI detection request", () => ({
      provider,
      model: this.config.model,
      immediateContextLength: immediateContext.length,
      broadContextLength: broadContext.length,
      userPromptLength: userPrompt.length,
      systemPromptLength: systemPrompt.length,
    }));

    const apiCallStart = performance.now();
    try {
      const analysis =
        provider === "google"
          ? await this.detectWithGemini(systemPrompt, userPrompt, { signal })
          : await this.detectWithOpenAI(systemPrompt, userPrompt, { signal });

      const apiCallTimeMs = performance.now() - apiCallStart;

      this.logger.debug("AI API call completed", {
        provider,
        model: this.config.model,
        apiCallTimeMs: Math.round(apiCallTimeMs),
        rawEventsCount: analysis.events.length,
        contextLanguage: analysis.context_language,
      });

      // Filter and transform events
      const filteredEvents = analysis.events.filter((event) => {
        const passed = this.filterDetectedEvents(event);
        if (!passed) {
          this.logger.trace("Event filtered out", {
            eventType: event.type,
            confidence: event.confidence,
            intensity: event.intensity,
            reason: this.getFilterReason(event),
          });
        }
        return passed;
      });

      this.logger.debug("Event filtering completed", {
        rawEventsCount: analysis.events.length,
        filteredEventsCount: filteredEvents.length,
        filteredOutCount: analysis.events.length - filteredEvents.length,
      });

      return filteredEvents.map(
        (event): Event => ({
          id: nanoid(),
          type: event.type,
          confidence: event.confidence,
          timestamp,
          duration: 0,
          intensity: event.intensity,
          triggers: event.triggers,
          metadata: {
            reasoning: event.reasoning,
            language: analysis.context_language,
            contentQualityScore: event.content_quality_score,
          },
        }),
      );
    } catch (error) {
      const apiCallTimeMs = performance.now() - apiCallStart;
      this.logger.error("AI detection API call failed: {message}", {
        message: (error as Error)?.message,
        name: (error as Error)?.name,
        provider,
        model: this.config.model,
        apiCallTimeMs: Math.round(apiCallTimeMs),
        stack: (error as Error)?.stack,
      });
      throw error;
    }
  }

  private filterDetectedEvents(
    event: z.infer<typeof DetectedEventSchema>,
  ): boolean {
    if (event.confidence < this.config.detectionSensitivity) {
      return false;
    }
    if (
      (event.type === "emotion_peak" || event.type === "topic_change") &&
      event.intensity < this.config.emotionThreshold
    ) {
      return false;
    }
    if (
      (event.type === "topic_change" ||
        event.type === "question_raised" ||
        event.type === "conclusion_reached" ||
        event.type === "summary_point") &&
      event.intensity < this.config.topicTransitionThreshold
    ) {
      return false;
    }
    if (
      event.type === "key_point" &&
      event.intensity < this.config.keypointDensityThreshold
    ) {
      return false;
    }
    return true;
  }

  private getFilterReason(event: z.infer<typeof DetectedEventSchema>): string {
    if (event.confidence < this.config.detectionSensitivity) {
      return `confidence ${event.confidence} below threshold ${this.config.detectionSensitivity}`;
    }
    if (
      (event.type === "emotion_peak" || event.type === "topic_change") &&
      event.intensity < this.config.emotionThreshold
    ) {
      return `emotion/topic intensity ${event.intensity} below threshold ${this.config.emotionThreshold}`;
    }
    if (
      (event.type === "topic_change" ||
        event.type === "question_raised" ||
        event.type === "conclusion_reached" ||
        event.type === "summary_point") &&
      event.intensity < this.config.topicTransitionThreshold
    ) {
      return `topic transition intensity ${event.intensity} below threshold ${this.config.topicTransitionThreshold}`;
    }
    if (
      event.type === "key_point" &&
      event.intensity < this.config.keypointDensityThreshold
    ) {
      return `key point intensity ${event.intensity} below threshold ${this.config.keypointDensityThreshold}`;
    }
    return "passed";
  }

  private async detectWithGemini(
    systemPrompt: string,
    userPrompt: string,
    { signal }: RequestOptions,
  ) {
    const { responseSchema, parse } = zodGeminiFormat(EventAnalysisSchema);

    if (this.config.modelProvider !== "google") {
      throw new Error("Invalid model provider");
    }

    const google = new GoogleGenAI({ apiKey: this.apiKeys.google });

    this.logger.debug("Calling Gemini API", {
      model: this.config.model,
      hasAbortSignal: !!signal,
    });

    const apiStart = performance.now();
    const response = await google.models.generateContent({
      model: this.config.model,
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        responseMimeType: "application/json",
        responseSchema,
        abortSignal: signal,
      },
    });
    const apiTimeMs = performance.now() - apiStart;

    this.logger.debug("Gemini API response received", {
      model: this.config.model,
      apiTimeMs: Math.round(apiTimeMs),
      hasText: !!response.text,
    });

    const responseText = response.text;
    if (!responseText) {
      this.logger.error("Gemini response missing text", {
        model: this.config.model,
        responseKeys: Object.keys(response),
      });
      throw new Error("No text in Gemini response");
    }

    const parseStart = performance.now();
    const analysis = parse(responseText);
    const parseTimeMs = performance.now() - parseStart;

    if (!analysis) {
      this.logger.error("Failed to parse Gemini response", {
        model: this.config.model,
        responseTextLength: responseText.length,
        responsePreview: responseText.substring(0, 200),
      });
      throw new Error("No analysis in Gemini response");
    }

    this.logger.debug("Gemini response parsed successfully", {
      model: this.config.model,
      parseTimeMs: Math.round(parseTimeMs),
      eventsCount: analysis.events?.length ?? 0,
      contextLanguage: analysis.context_language,
    });

    return analysis;
  }

  private async detectWithOpenAI(
    systemPrompt: string,
    userPrompt: string,
    { signal }: RequestOptions,
  ) {
    if (this.config.modelProvider !== "openai") {
      throw new Error("Invalid model provider");
    }

    const openai = new OpenAI({ apiKey: this.apiKeys.openai });
    this.logger.debug("Calling OpenAI API", {
      model: this.config.model,
      hasAbortSignal: !!signal,
      messageCount: 2,
    });

    const apiStart = performance.now();
    const response = await openai.chat.completions.parse(
      {
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        response_format: zodResponseFormat(
          EventAnalysisSchema,
          "event_analysis",
        ),
        reasoning_effort: "minimal",
        verbosity: "low",
      },
      { signal },
    );
    const apiTimeMs = performance.now() - apiStart;

    this.logger.debug("OpenAI API response received", {
      model: this.config.model,
      apiTimeMs: Math.round(apiTimeMs),
      usage: response.usage,
      finishReason: response.choices[0]?.finish_reason,
    });

    const message = response.choices[0]?.message;
    if (message?.refusal) {
      this.logger.error("OpenAI refused request: {refusal}", {
        refusal: message.refusal,
        model: this.config.model,
      });
      throw new Error(message.refusal);
    }

    if (!message?.parsed) {
      this.logger.error("OpenAI response missing parsed content", {
        model: this.config.model,
        hasMessage: !!message,
        messageContent: message?.content?.substring(0, 200),
      });
      throw new Error("No parsed content in response");
    }

    const analysis = message.parsed;
    if (!analysis) {
      this.logger.error("OpenAI parsed content is null", {
        model: this.config.model,
        messageKeys: Object.keys(message),
      });
      throw new Error("No analysis in OpenAI response");
    }

    this.logger.debug("OpenAI response parsed successfully", {
      model: this.config.model,
      eventsCount: analysis.events?.length ?? 0,
      contextLanguage: analysis.context_language,
      tokenUsage: response.usage,
    });

    return analysis;
  }
}
