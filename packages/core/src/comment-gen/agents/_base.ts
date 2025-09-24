import { Agent } from "@openai/agents-core";
import { RECOMMENDED_PROMPT_PREFIX } from "@openai/agents-core/extensions";
import z from "zod";
import { zodAgentFormat } from "../../lib/zod4-schema.js";

export function buildCommentAgent({
  name,
  instructions,
  minLength,
  maxLength,
  model = "gpt-4o-mini",
}: {
  name: string;
  instructions: string;
  minLength: number;
  maxLength: number;
  model?: string;
}) {
  const schema = z.object({
    reject: z.literal(false),
    comment: z.string().min(minLength).max(maxLength),
  });
  return new Agent({
    name: `${name}-comment-writer`,
    instructions: [RECOMMENDED_PROMPT_PREFIX, instructions].join("\n\n"),
    outputType: zodAgentFormat(schema, "comment-acceptance"),
    model,
  });
}
