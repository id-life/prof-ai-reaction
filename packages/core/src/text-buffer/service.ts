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
