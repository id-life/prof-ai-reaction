import z from "zod";

export interface Decision {
  shouldComment: boolean;
  confidence: number; // 0-1
  score: number; // 0-1
  factors: Record<string, number>;
  priority: "low" | "medium" | "high";
  suggestedDelay: number; // milliseconds
  reasoning: string;
}

export const DecisionEngineConfigSchema = z.object({
  baseThreshold: z
    .number()
    .min(0)
    .max(1)
    .describe("Base threshold for decision engine"),
  minInterval: z
    .number()
    .min(0)
    .describe("Minimum interval between comments in seconds"),
  maxInterval: z
    .number()
    .min(0)
    .describe("Maximum interval between comments in seconds"),
  emotionWeight: z.number().min(0).max(1).describe("Weight for emotion factor"),
  topicWeight: z.number().min(0).max(1).describe("Weight for topic factor"),
  timingWeight: z.number().min(0).max(1).describe("Weight for timing factor"),
  importanceWeight: z
    .number()
    .min(0)
    .max(1)
    .describe("Weight for importance factor"),
  keywordWeight: z.number().min(0).max(1).describe("Weight for keyword factor"),
  frequencySuppression: z
    .number()
    .min(0)
    .max(1)
    .describe("Frequency suppression factor"),
  timeDecayRate: z.number().min(0).max(1).describe("Time decay rate"),
});

export const defaultDecisionEngineConfig: DecisionEngineConfig = {
  baseThreshold: 0.65,
  minInterval: 20,
  maxInterval: 90,
  emotionWeight: 0.2,
  topicWeight: 0.4,
  timingWeight: 0.15,
  importanceWeight: 0.6,
  keywordWeight: 0.3,
  frequencySuppression: 0.8,
  timeDecayRate: 0.95,
};

export type DecisionEngineConfig = z.output<typeof DecisionEngineConfigSchema>;
