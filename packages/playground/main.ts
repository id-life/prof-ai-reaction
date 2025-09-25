import { readFile } from "node:fs/promises";
import { createCommentSystem, type Turn, writers } from "ai-reaction";
import { parseText } from "media-captions";
import { createNanoEvents } from "nanoevents";

interface PlayerEvents {
  play: () => void;
  pause: () => void;
  "speed-changed": (speed: number) => void;
  seek: (time: number) => void;
  "time-update": (currentTime: number) => void;
  "cue-start": (cue: Turn) => void;
  "cue-end": (cue: Turn) => void;
  ended: () => void;
}

class Player implements Disposable {
  private turns: Turn[];
  private currentTime = 0;
  private isPlaying = false;
  private playbackSpeed = 1;
  private intervalId: NodeJS.Timeout | null = null;
  private lastTickTime = 0;
  private emitter = createNanoEvents<PlayerEvents>();
  private activeTurns = new Set<string>();

  constructor(turns: Turn[]) {
    this.turns = turns;
  }

  on<E extends keyof PlayerEvents>(event: E, listener: PlayerEvents[E]): void {
    this.emitter.on(event, listener);
  }

  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTickTime = Date.now();
    this.intervalId = setInterval(() => this.tick(), 16);
    this.emitter.emit("play");
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.emitter.emit("pause");
  }

  setSpeed(speed: number) {
    this.playbackSpeed = speed;
    this.emitter.emit("speed-changed", this.playbackSpeed);
  }

  seekTo(time: number) {
    this.currentTime = Math.max(0, time);
    this.emitter.emit("seek", this.currentTime);
  }

  getCurrentTime() {
    return this.currentTime;
  }

  [Symbol.dispose]() {
    this.intervalId && clearInterval(this.intervalId);
  }

  private tick() {
    const now = Date.now();
    const deltaMs = now - this.lastTickTime;
    this.lastTickTime = now;

    this.currentTime += (deltaMs / 1000) * this.playbackSpeed;
    this.emitter.emit("time-update", this.currentTime);

    const lastTurnEndTime = Math.max(...this.turns.map((t) => t.endTime));
    if (this.currentTime >= lastTurnEndTime) {
      this.pause();
      this.emitter.emit("ended");
      return;
    }

    for (const turn of this.turns) {
      if (
        turn.startTime <= this.currentTime &&
        this.currentTime <= turn.endTime
      ) {
        if (!this.activeTurns.has(turn.id)) {
          this.activeTurns.add(turn.id);
          this.emitter.emit("cue-start", turn);
        }
      } else if (this.activeTurns.has(turn.id)) {
        this.activeTurns.delete(turn.id);
        this.emitter.emit("cue-end", turn);
      }
    }
  }
}

export async function main(input: string) {
  const content = await readFile(input, "utf-8");
  const cues = input.endsWith(".txt")
    ? mimicSubtitle(content)
    : await parseSubtitle(content);

  const player = new Player(cues);
  const commentSystem = createCommentSystem({
    apiKeys: {
      openai: process.env.OPENAI_API_KEY!,
      google: process.env.GOOGLE_API_KEY!,
    },
    config: {
      commentGenerator: {
        writers: [
          writers.analytical,
          writers.descriptive,
          writers.emotional,
          writers.humorous,
          writers.predictive,
          writers.summary,
        ],
      },
    },
    debug: true,
  });

  player.on("cue-end", (cue) => {
    commentSystem.onTurnCompleted(cue);
  });

  commentSystem.on("comment-generated", (comment) => {
    console.log("[comment-generated]", comment);
  });

  player.setSpeed(3);
  player.play();
}

async function parseSubtitle(text: string): Promise<Turn[]> {
  return (await parseText(text)).cues.map((c) => ({
    id: c.id,
    startTime: c.startTime,
    endTime: c.endTime,
    content: c.text,
  }));
}

function mimicSubtitle(text: string): Turn[] {
  const lines = text
    .split("\n")
    .map((v) => v.trim())
    .filter((v) => !!v);

  const segmenter = new Intl.Segmenter("und", { granularity: "word" });
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

// Simple CLI entry for local testing
if (import.meta.main) {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: node main.js <input.(srt|vtt|txt)>");
    process.exit(1);
  }
  // eslint-disable-next-line unicorn/prefer-top-level-await
  main(input)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
