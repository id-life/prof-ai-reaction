import type { Turn } from "@prof/ai-reaction";
import { parseText } from "media-captions";

export async function parseSubtitle(text: string): Promise<Turn[]> {
  return (await parseText(text)).cues.map((c) => ({
    id: c.id,
    startTime: c.startTime,
    endTime: c.endTime,
    content: c.text,
  }));
}

export function mimicTurns(text: string): Turn[] {
  const lines = text
    .split("\n")
    .map((v) => v.trim())
    .filter((v) => !!v);

  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  const perWordMs = 300;
  const gapMs = 500;

  let currentMs = 0;

  return lines.map((line, index) => {
    const segments = Array.from(segmenter.segment(line));
    const wordCount =
      segments.reduce((count, seg) => count + (seg.isWordLike ? 1 : 0), 0) || 1;

    const durationMs = wordCount * perWordMs;
    const startMs = currentMs;
    const endMs = startMs + durationMs;
    currentMs = endMs + gapMs;

    return {
      id: String(index + 1),
      startTime: startMs / 1000,
      endTime: endMs / 1000,
      content: line,
    };
  });
}
