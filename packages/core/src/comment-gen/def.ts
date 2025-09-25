import type { Agent } from "@openai/agents-core";
import type z from "zod";

export type CommentAgent = Agent<
  unknown,
  z.ZodObject<{ reject: z.ZodLiteral<false>; content: z.ZodString }>
>;

export interface CommentGeneratorConfig {
  writers: CommentAgentConfig[];
  selectorModel: string;
  selectorInstructions: string;
}

export interface CommentAgentConfig {
  name: string;
  instructions: string;
  minLength: number;
  maxLength: number;
  model?: string;
}

export const defaultCommentGeneratorConfig = {
  writers: [],
  selectorModel: "gpt-5-mini",
  selectorInstructions: "",
} satisfies CommentGeneratorConfig;
