import { Agent } from "@openai/agents";
import z from "zod";
import { zodAgentFormat } from "../../lib/zod4-schema.js";
import {
  analytical,
  descriptive,
  emotional,
  humorous,
  predictive,
  summary,
} from "./writer.js";

const rejectSchema = z.object({
  reject: z.literal(true),
  reason: z
    .string()
    .describe("The reason for rejecting the comment in current context"),
});

export default Agent.create({
  name: "style-selector",
  instructions:
    "You choose the best comment style given the provided conversation context, then hand off to that style writer. If the current context is not suitable for generating a comment (e.g., insufficient content, off-topic, unsafe, or nothing meaningful to add), do not hand off—return a comment-rejection with { reject: true, reason } explaining why.",
  handoffs: [descriptive, analytical, emotional, summary, predictive, humorous],
  outputType: zodAgentFormat(rejectSchema, "comment-rejection"),
  model: "gpt-5-mini",
});
