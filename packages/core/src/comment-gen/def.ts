import type { Agent } from "@openai/agents-core";
import z from "zod/v4";

export type CommentAgent = Agent<
  unknown,
  z.ZodObject<{ reject: z.ZodLiteral<false>; content: z.ZodString }>
>;

export const CommentAgentConfigSchema = z.object({
  name: z.string().describe("Name of the comment agent"),
  instructions: z.string().describe("Instructions for the comment agent"),
  minLength: z.number().min(0).describe("Minimum length of generated comments"),
  maxLength: z.number().min(0).describe("Maximum length of generated comments"),
  model: z.string().optional().describe("Model to use for comment generation"),
});

export const CommentGeneratorConfigSchema = z.object({
  writers: z
    .array(CommentAgentConfigSchema)
    .describe("Array of comment agent configurations"),
  selectorModel: z.string().describe("Model to use for selecting comments"),
  selectorInstructions: z
    .string()
    .describe("Instructions for comment selection"),
});

export const defaultCommentGeneratorConfig: CommentGeneratorConfig = {
  writers: [],
  selectorModel: "gpt-5-mini",
  selectorInstructions: "",
};

export type CommentAgentConfig = z.output<typeof CommentAgentConfigSchema>;
export type CommentGeneratorConfig = z.output<
  typeof CommentGeneratorConfigSchema
>;
