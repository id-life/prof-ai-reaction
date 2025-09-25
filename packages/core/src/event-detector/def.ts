import { z } from "zod";
import { eventTypeSchema } from "../type.js";

export const systemPrompt = `
You are an expert event detector for real-time conversation analysis. Your job is to detect significant conversational events from the current user content, using the uncommented recent context as primary grounding and the broader context for background.

Follow the provided schema exactly. Be language-agnostic and robust across languages, dialects, and code-mixed text. Return concise, high-signal events only.

Guidance on INTENSITY by event type (0.0–1.0). Intensity measures the salience/strength of THIS event type, not your confidence:
- emotion_peak: How strong/heightened the expressed emotion is
  - 0.2–0.4: mild affect or subtle tone
  - 0.5–0.7: clear emotional expression
  - 0.8–1.0: strong/heightened emotion, exclamations, strong sentiment words
- topic_change: How large the shift is from the prior topic
  - 0.2–0.4: minor subtopic shift, same track
  - 0.5–0.7: clear pivot to a new angle
  - 0.8–1.0: major/new domain or goal shift
- question_raised: How central/urgent the question is to progress
  - 0.2–0.4: casual or side curiosity
  - 0.5–0.7: important to proceed or unblock
  - 0.8–1.0: decision-critical or blocking
- conclusion_reached: Finality/impact of the conclusion/decision
  - 0.3–0.5: tentative or soft take-away
  - 0.6–0.8: clear decision or resolved point
  - 0.9–1.0: definitive decision, milestone or commitment
- key_point: Importance/novelty of the information stated
  - 0.2–0.4: useful detail
  - 0.5–0.7: core fact/insight
  - 0.8–1.0: pivotal insight or requirement
- climax_moment: Peak significance or tension in the narrative/progress
  - 0.5–0.7: build-up or near-peak
  - 0.8–1.0: clear climax/turning point
- summary_point: Coverage and structure of the summary
  - 0.2–0.4: brief recap
  - 0.5–0.7: structured, multi-point summary
  - 0.8–1.0: comprehensive, milestone-level summary

Additional instructions:
- Use the uncommented recent context to anchor your interpretation; use broader context only as supporting background.
- triggers should be short phrases/words that directly prompted the detection.
- confidence reflects your certainty in the detection; intensity reflects how strong/important the event itself is.
- content_quality_score (0-10): Rate content quality where higher scores indicate more substantive/technical content. Consider: technical terms, research/data mentions, methodical approaches, meaningful questions that prompt thinking, conclusions with insights. Lower scores for pure emotion or casual remarks.
- Avoid duplicate events with the same type and triggers in the same turn. Prefer the most salient ones.

Few-shot examples (illustrative, not exhaustive):

Example 1
Input (immediate): "This is super frustrating. We've tried three fixes and none worked!"
Input (broad): "We are debugging a flaky test in CI."
Expected output:
events: [
  {
    type: "emotion_peak",
    confidence: 0.86,
    intensity: 0.82,
    triggers: ["super frustrating", "none worked"],
    reasoning: "Strong negative emotion and emphasis indicate heightened affect.",
    content_quality_score: 3
  },
  {
    type: "key_point",
    confidence: 0.72,
    intensity: 0.55,
    triggers: ["tried three fixes"],
    reasoning: "Important status: multiple attempts failed.",
    content_quality_score: 6
  }
]

Example 2
Input (immediate): "Instead of unit tests, let's focus on end-to-end coverage. Does that make sense?"
Input (broad): "Planning the testing strategy for the release."
Expected output:
events: [
  {
    type: "topic_change",
    confidence: 0.83,
    intensity: 0.68,
    triggers: ["Instead of", "focus on end-to-end"],
    reasoning: "Clear pivot in testing approach.",
    content_quality_score: 7
  },
  {
    type: "question_raised",
    confidence: 0.88,
    intensity: 0.74,
    triggers: ["Does that make sense?"],
    reasoning: "Direct question seeking alignment on approach.",
    content_quality_score: 5
  }
]

Example 3
Input (immediate): "Let's ship the basic flow today and polish the UI next sprint. To recap: auth, checkout, and webhooks are done."
Input (broad): "Release readiness meeting."
Expected output:
events: [
  {
    type: "conclusion_reached",
    confidence: 0.9,
    intensity: 0.82,
    triggers: ["Let's ship", "today"],
    reasoning: "Definitive decision on shipping scope.",
    content_quality_score: 6
  },
  {
    type: "summary_point",
    confidence: 0.84,
    intensity: 0.7,
    triggers: ["To recap", "auth", "checkout", "webhooks are done"],
    reasoning: "Structured recap of completed items.",
    content_quality_score: 8
  }
]`;

export const buildUserPrompt = (
  immediateContext: string,
  broadContext: string,
  content: string,
) => `Broader conversation context: "${broadContext}"

Uncommented recent context (focus on this): "${immediateContext}"

Current content: "${content}"

Analyze the current content primarily in the context of the uncommented recent conversation, using the broader context for additional understanding. Detect any significant events that warrant a comment.`;

export const EventDetectorConfigSchema = z.object({
  detectionSensitivity: z
    .number()
    .min(0)
    .max(1)
    .describe("Minimum confidence threshold for event detection"),
  emotionThreshold: z
    .number()
    .min(0)
    .max(1)
    .describe("Minimum intensity threshold for emotional events"),
  topicTransitionThreshold: z
    .number()
    .min(0)
    .max(1)
    .describe("Minimum intensity threshold for topic transition events"),
  keypointDensityThreshold: z
    .number()
    .min(0)
    .max(1)
    .describe("Minimum density threshold for keypoint events"),
  modelProvider: z.enum(["openai", "google"]),
  model: z.string(),
});

export const defaultEventDetectorConfig: EventDetectorConfig = {
  detectionSensitivity: 0.7,
  emotionThreshold: 0.75,
  topicTransitionThreshold: 0.3,
  // Use 0-1 scale for intensity thresholds; 0.5 is a balanced default
  keypointDensityThreshold: 0.5,
  modelProvider: "openai",
  model: "gpt-5-nano",
};

export type EventDetectorConfig = z.output<typeof EventDetectorConfigSchema>;

export const DetectedEventSchema = z.object({
  type: eventTypeSchema,
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How confident you are (0.0-1.0)"),
  intensity: z
    .number()
    .min(0)
    .max(1)
    .describe("How intense/significant the event is (0.0-1.0)"),
  triggers: z
    .array(z.string())
    .describe("Specific words/phrases that triggered the detection"),
  reasoning: z
    .string()
    .describe("Brief explanation of why this event was detected"),
  content_quality_score: z
    .number()
    .int()
    .min(0)
    .max(10)
    .describe(
      "Content quality score (0-10): higher for technical/substantive content",
    ),
});
export const EventAnalysisSchema = z.object({
  events: z.array(DetectedEventSchema),
  context_language: z.string(),
});
