import { Agent } from "@openai/agents";
import { RECOMMENDED_PROMPT_PREFIX } from "@openai/agents-core/extensions";
import z from "zod/v4";
import { zodAgentFormat } from "../../lib/zod4-schema.js";
import type { CommentAgent } from "../def.js";

const rejectSchema = z.object({
  reject: z.literal(true),
  reason: z
    .string()
    .describe("The reason for rejecting the comment in current context"),
});

export default function buildCommentGenerator({
  writers,
  selectorModel = "gpt-5-mini",
  selectorInstructions = "",
}: {
  writers: CommentAgent[];
  selectorModel?: string;
  selectorInstructions?: string;
}) {
  if (writers.length === 0) {
    throw new Error("No writers provided");
  }
  return Agent.create({
    name: "style-selector",
    instructions: [
      RECOMMENDED_PROMPT_PREFIX,
      "You choose the best comment style given the provided conversation context, then hand off to that style writer. If the current context is not suitable for generating a comment (e.g., insufficient content, off-topic, unsafe, or nothing meaningful to add), do not hand off—return a comment-rejection with { reject: true, reason } explaining why.",
      selectorInstructions,
    ]
      .filter(Boolean)
      .join("\n\n"),
    handoffs: writers,
    outputType: zodAgentFormat(rejectSchema, "comment-rejection"),
    model: selectorModel,
  });
}
