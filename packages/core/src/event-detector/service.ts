import { GoogleGenAI } from "@google/genai";
import { nanoid } from "nanoid";
import { OpenAI } from "openai";
import type { z } from "zod";
import { zodGeminiFormat, zodResponseFormat } from "../lib/zod4-schema.js";
import type { Event, EventType, Turn } from "../type.js";
import {
  buildUserPrompt,
  type DetectedEventSchema,
  EventAnalysisSchema,
  type EventDetectorConfig,
  systemPrompt,
} from "./def.js";

export class EventDetector {
  private lastEventTime: Map<EventType, number> = new Map();

  constructor(private config: EventDetectorConfig) {}

  async detect(
    turn: Turn,
    uncommentedText: string,
    fullContext?: string,
  ): Promise<Event[]> {
    const events: Event[] = [];
    const now = turn.endTime;

    // AI-powered event detection using uncommented text for better context
    const contextForDetection = fullContext || uncommentedText;
    const aiEvents = await this.detectWithAI(
      turn.content,
      uncommentedText,
      contextForDetection,
      now,
    );
    for (const aiEvent of aiEvents) {
      events.push(aiEvent);
      this.lastEventTime.set(aiEvent.type, now);
    }

    return events;
  }

  private async detectWithAI(
    content: string,
    uncommentedText: string,
    fullContext: string,
    timestamp: number,
  ) {
    const immediateContext = uncommentedText;
    const broadContext = fullContext.slice(-1500);

    const userPrompt = buildUserPrompt(immediateContext, broadContext, content);

    const provider = this.config.model.provider;
    const analysis =
      provider === "google"
        ? await this.detectWithGemini(systemPrompt, userPrompt)
        : await this.detectWithOpenAI(systemPrompt, userPrompt);
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

  private async detectWithGemini(systemPrompt: string, userPrompt: string) {
    const { responseSchema, parse } = zodGeminiFormat(EventAnalysisSchema);

    if (this.config.model.provider !== "google") {
      throw new Error("Invalid model provider");
    }

    const { apiKey, model } = this.config.model;

    const google = new GoogleGenAI({ apiKey });

    const response = await google.models.generateContent({
      model,
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        responseMimeType: "application/json",
        responseSchema,
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

  private async detectWithOpenAI(systemPrompt: string, userPrompt: string) {
    if (this.config.model.provider !== "openai") {
      throw new Error("Invalid model provider");
    }

    const { apiKey, model } = this.config.model;

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.parse({
      model,
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
      response_format: zodResponseFormat(EventAnalysisSchema, "event_analysis"),
      reasoning_effort: "minimal",
      verbosity: "low",
    });

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
