import z from "zod";

export interface Turn {
  id: string;
  content: string;
  startTime: number; // NPT timestamp
  endTime: number; // NPT timestamp
}

export interface TextSegment {
  content: string;
  timestamp: number;
  position: number;
}

export const eventTypeSchema = z.union([
  z
    .literal("emotion_peak")
    .describe(
      "Strong emotional expressions (positive, negative, excitement, frustration)",
    ),
  z
    .literal("topic_change")
    .describe("Shifts in conversation topic or subject matter"),
  z
    .literal("question_raised")
    .describe("Questions being asked or inquiry moments"),
  z
    .literal("conclusion_reached")
    .describe("Summaries, conclusions, or decision points"),
  z
    .literal("key_point")
    .describe("Important statements or significant information"),
  z
    .literal("climax_moment")
    .describe("Peak moments of intensity or importance"),
  z.literal("summary_point").describe("Recap or summarization moments"),
]);

export type EventType = z.infer<typeof eventTypeSchema>;

export interface Event {
  id: string;
  type: EventType;
  confidence: number; // 0-1
  timestamp: number;
  duration: number;
  intensity: number; // 0-1
  triggers: string[];
  metadata?: {
    detectedViaTimer?: boolean;
    reasoning?: string;
    language?: string;
    contentQualityScore?: number;
  };
}

export interface Decision {
  shouldComment: boolean;
  confidence: number; // 0-1
  score: number; // 0-1
  factors: Record<string, number>;
  priority: "low" | "medium" | "high";
  suggestedDelay: number; // milliseconds
  reasoning: string;
}

export const commentStyleSchema = z.enum([
  "descriptive",
  "analytical",
  "emotional",
  "summary",
  "predictive",
  "humorous",
]);

export type CommentStyle = z.infer<typeof commentStyleSchema>;

export interface Comment {
  id: string;
  content: string;
  style: CommentStyle;
  length: number;
  generationTime: number;
  confidence: number;
  metadata?: {
    timestamp: number;
    alternativeStyle?: string;
    fallback?: boolean;
  };
}

