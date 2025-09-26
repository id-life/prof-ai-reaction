import type { Turn } from "@prof/ai-reaction";
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

export class Player implements Disposable {
  private turns: Turn[];
  private currentTime = 0;
  private isPlaying = false;
  private playbackSpeed = 1;
  private intervalId: NodeJS.Timeout | number | null = null;
  private lastTickTime = 0;
  private emitter = createNanoEvents<PlayerEvents>();
  private activeTurns = new Set<string>();

  constructor(turns: Turn[]) {
    this.turns = turns;
  }

  on<E extends keyof PlayerEvents>(
    event: E,
    listener: PlayerEvents[E],
  ): VoidFunction {
    return this.emitter.on(event, listener);
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
