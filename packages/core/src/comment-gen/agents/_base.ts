import { Agent } from "@openai/agents-core";
import { RECOMMENDED_PROMPT_PREFIX } from "@openai/agents-core/extensions";
import z from "zod";
import { zodAgentFormat } from "../../lib/zod4-schema.js";
import type { CommentAgent } from "../def.js";

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
}): CommentAgent {
  const schema = z.object({
    reject: z.literal(false),
    // don't use maxLength here because it lead to truncation of the comment
    content: z.string().min(minLength),
  });
  return new Agent({
    name: `${name}-comment-writer`,
    instructions: [
      RECOMMENDED_PROMPT_PREFIX,
      instructions,
      // use prompt suggestion for max length instead of schema, although llm may not strictly follow it
      `The comment should be no longer than ${maxLength} characters, and should be no shorter than ${minLength} characters`,
    ].join("\n\n"),
    outputType: zodAgentFormat(schema, "comment-acceptance"),
    model,
  });
}
