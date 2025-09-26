import { run, setDefaultOpenAIClient } from "@openai/agents";
import type OpenAI from "openai";
import type { Comment, Event } from "../type.js";
import { buildCommentAgent } from "./agents/_base.js";
import buildCommentGenerator from "./agents/selector.js";
import type { CommentGeneratorConfig } from "./def.js";

export async function generateComment(
  context: GenerationContext,
  {
    signal,
    writers,
    selectorInstructions,
    selectorModel,
    openaiClient,
  }: CommentGeneratorConfig & {
    signal?: AbortSignal;
    openaiClient?: OpenAI;
  },
) {
  if (!openaiClient) {
    throw new Error("OpenAI API key is required to generate a comment");
  }
  // biome-ignore lint/suspicious/noExplicitAny: setDefaultOpenAIClient expects any
  setDefaultOpenAIClient(openaiClient as any);
  const userInput = buildUserInput(context);
  const agent = buildCommentGenerator({
    writers: writers.map((w) => buildCommentAgent(w)),
    selectorInstructions,
    selectorModel,
  });

  const response = await run(agent, userInput, { signal, stream: true });
  return response;
}

function buildUserInput(ctx: GenerationContext): string {
  const eventDescriptions = ctx.events
    .slice(0, 5)
    .map((e) => `${e.type}: ${e.triggers.join(", ")}`)
    .join("; ");

  const recentUncommented =
    ctx.uncommentedText?.slice(-600) || ctx.historicalText.slice(-400);
  const previousCommentsContext = ctx.previousComments
    .slice(-3)
    .map((c) => `"${c.content}" (${c.writer})`)
    .join("; ");

  return JSON.stringify({
    current: ctx.currentText,
    recent: recentUncommented,
    history: ctx.historicalText,
    events: eventDescriptions || "General",
    previousComments: previousCommentsContext || "None",
    goal: "Generate a single comment that helps the audience understand and appreciate this moment.",
  });
}

export interface GenerationContext {
  currentText: string;
  historicalText: string;
  uncommentedText?: string;
  previousComments: Comment[];
  events: Event[];
}
