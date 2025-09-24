import { run } from "@openai/agents";
import type { CommentStyle, Event } from "../type.js";
import selector from "./agents/selector.js";

export async function generateComment(
  context: GenerationContext,
  { signal }: { signal?: AbortSignal } = {},
) {
  const userInput = buildUserInput(context);
  const response = await run(selector, userInput, { signal, stream: true });
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
    .map((c) => `"${c.content}" (${c.style})`)
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
  previousComments: Array<{
    content: string;
    style: CommentStyle;
  }>;
  events: Event[];
}
