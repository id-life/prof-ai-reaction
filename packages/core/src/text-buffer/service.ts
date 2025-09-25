import { createNanoEvents } from "nanoevents";
import type { TextSegment, Turn } from "../type.js";
import type { BufferStats, TextBufferConfig } from "./def.js";

export class TextBuffer {
  private segments: TextSegment[] = [];
  private position = 0;

  constructor(private config: TextBufferConfig) {}

  append(turn: Turn): void {
    const segment: TextSegment = {
      content: turn.content,
      timestamp: turn.endTime,
      position: this.position++,
    };

    this.segments.push(segment);
  }

  getWindow(size: number = this.config.windowDuration): string {
    const now = this.segments[this.segments.length - 1]?.timestamp || 0;
    const cutoff = now - size * 1000;

    return this.segments
      .filter((s) => s.timestamp >= cutoff)
      .map((s) => s.content)
      .join(" ");
  }

  getRange(start: number, end: number): string {
    return this.segments
      .filter((s) => s.timestamp >= start && s.timestamp <= end)
      .map((s) => s.content)
      .join(" ");
  }

  getLastNCharacters(n: number): string {
    const text = this.segments.map((s) => s.content).join(" ");
    return text.slice(-n);
  }

  search(
    pattern: string,
    limit = 10,
  ): Array<{ content: string; timestamp: number }> {
    const results: Array<{ content: string; timestamp: number }> = [];
    const regex = new RegExp(pattern, "gi");

    for (const segment of this.segments.slice().reverse()) {
      if (regex.test(segment.content)) {
        results.push({
          content: segment.content,
          timestamp: segment.timestamp,
        });
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  clear(): void {
    this.segments = [];
    this.position = 0;
  }

  getStatistics(): BufferStats {
    if (this.segments.length === 0) {
      return {
        totalCharacters: 0,
        segmentCount: 0,
        oldestTimestamp: 0,
        newestTimestamp: 0,
        averageSegmentSize: 0,
      };
    }

    const totalChars = this.segments.reduce(
      (sum, s) => sum + s.content.length,
      0,
    );

    return {
      totalCharacters: totalChars,
      segmentCount: this.segments.length,
      oldestTimestamp: this.segments[0].timestamp,
      newestTimestamp: this.segments[this.segments.length - 1].timestamp,
      averageSegmentSize: totalChars / this.segments.length,
    };
  }

  getRecentSegments(count: number): TextSegment[] {
    return this.segments.slice(-count);
  }
}

export interface ShortTurnAggregatorEvents {
  timeout: (turn: Turn) => void;
}

export class ShortTurnAggregator implements Disposable {
  private bufferedContent = "";
  private bufferedStartTime = 0;
  private lastTurnEndTime = 0;
  private timeoutHandle: number | NodeJS.Timeout | null = null;
  private emitter = createNanoEvents<ShortTurnAggregatorEvents>();

  constructor(private config: TextBufferConfig) {}

  /**
   * Add a turn; returns an aggregated synthetic turn when threshold met or timeout previously fired.
   * If returns null, caller should not process yet.
   */
  add(turn: Turn): Turn | null {
    const content = turn.content ?? "";

    // If there is no active buffer, start one.
    const hasActiveBuffer = this.bufferedContent.length > 0;
    const tooFarFromPrevious =
      hasActiveBuffer &&
      turn.startTime - this.lastTurnEndTime > this.config.aggregationMaxGapMs;

    if (!hasActiveBuffer || tooFarFromPrevious) {
      this.resetBuffer();
      this.bufferedStartTime = turn.startTime;
    }

    // Append with a separating space if needed
    this.bufferedContent = this.bufferedContent
      ? `${this.bufferedContent} ${content}`
      : content;
    this.lastTurnEndTime = turn.endTime;

    // If duration threshold reached, emit immediately and clear
    if (
      this.bufferedStartTime > 0 &&
      this.lastTurnEndTime - this.bufferedStartTime >=
        this.config.minTurnDurationMs
    ) {
      const aggregated: Turn = {
        id: turn.id,
        content: this.bufferedContent,
        startTime: this.bufferedStartTime,
        endTime: this.lastTurnEndTime,
      };
      this.clearTimeout();
      this.resetBuffer();
      return aggregated;
    }

    // Otherwise schedule a timeout if not already scheduled
    if (!this.timeoutHandle) {
      this.timeoutHandle = setTimeout(() => {
        const pending = this.peek();
        if (pending) this.emitter.emit("timeout", pending);
        this.clearTimeout();
        this.resetBuffer();
      }, this.config.aggregationMaxDelayMs);
    }

    return null;
  }

  on<E extends keyof ShortTurnAggregatorEvents>(
    event: E,
    listener: ShortTurnAggregatorEvents[E],
  ): void {
    this.emitter.on(event, listener);
  }

  /** Return a non-destructive view of the current buffered turn */
  peek(): Turn | null {
    if (!this.bufferedContent) return null;
    return {
      id: `${this.bufferedStartTime}`,
      content: this.bufferedContent,
      startTime: this.bufferedStartTime,
      endTime: this.lastTurnEndTime,
    };
  }

  /** Force flush (if any) even if below threshold; returns turn or null */
  flush(): Turn | null {
    if (!this.bufferedContent) return null;
    const turn: Turn = {
      id: `${this.bufferedStartTime}`,
      content: this.bufferedContent,
      startTime: this.bufferedStartTime,
      endTime: this.lastTurnEndTime,
    };
    this.clearTimeout();
    this.resetBuffer();
    return turn;
  }

  clear(): void {
    this.clearTimeout();
    this.resetBuffer();
  }
  [Symbol.dispose]() {
    this.clear();
  }

  private resetBuffer(): void {
    this.bufferedContent = "";
    this.bufferedStartTime = 0;
    this.lastTurnEndTime = 0;
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}
