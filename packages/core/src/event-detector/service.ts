import { GoogleGenAI } from "@google/genai";
import { nanoid } from "nanoid";
import { OpenAI } from "openai";
import type { z } from "zod";
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

    // AI-powered event detection using uncommented text for better context
    const contextForDetection = fullContext || uncommentedText;
    const aiEvents = await this.detectWithAI(
      {
        content: turn.content,
        uncommentedText,
        fullContext: contextForDetection,
        timestamp: now,
      },
      { signal },
    );
    for (const aiEvent of aiEvents) {
      events.push(aiEvent);
      this.lastEventTime.set(aiEvent.type, now);
    }

    return events;
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
    const analysis =
      provider === "google"
        ? await this.detectWithGemini(systemPrompt, userPrompt, { signal })
        : await this.detectWithOpenAI(systemPrompt, userPrompt, { signal });
    return analysis.events
      .filter((event) => this.filterDetectedEvents(event))
      .map(
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

    const response = await google.models.generateContent({
      model: this.config.model,
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        responseMimeType: "application/json",
        responseSchema,
        abortSignal: signal,
      },
    });

    console.debug("Gemini response:", response);

    const responseText = response.text;
    if (!responseText) {
      throw new Error("No text in Gemini response");
    }

    const analysis = parse(responseText);
    if (!analysis) {
      throw new Error("No analysis in Gemini response");
    }

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

    console.debug("OpenAI response:", response);

    const message = response.choices[0]?.message;
    if (message?.refusal) {
      throw new Error(message.refusal);
    }
    if (!message?.parsed) {
      throw new Error("No parsed content in response");
    }

    const analysis = message.parsed;
    if (!analysis) {
      throw new Error("No analysis in OpenAI response");
    }

    return analysis;
  }
}
