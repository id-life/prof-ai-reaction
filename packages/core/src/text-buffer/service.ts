import { getLogger } from "@logtape/logtape";
import type { TextSegment, Turn } from "../type.js";
import type { BufferStats, TextBufferConfig } from "./def.js";

export class TextBuffer {
  private segments: TextSegment[] = [];
  private position = 0;
  private logger = getLogger(["ai-reaction", "text-buffer"]);
  private segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

  constructor(private config: TextBufferConfig) {}

  private countWords(text: string): number {
    const segments = Array.from(this.segmenter.segment(text));
    return segments.filter(segment =>
      segment.isWordLike &&
      /\w/.test(segment.segment)
    ).length;
  }

  append(turn: Turn): void {
    const segment: TextSegment = {
      content: turn.content,
      timestamp: turn.endTime,
      position: this.position++,
    };

    this.segments.push(segment);

    this.logger.trace("Appended turn to buffer", () => ({
      turnId: turn.id,
      contentLength: turn.content?.length ?? 0,
      timestamp: turn.endTime,
      position: segment.position,
      totalSegments: this.segments.length,
      bufferSizeWords: this.segments.reduce(
        (sum, s) => sum + this.countWords(s.content),
        0,
      ),
    }));
  }

  getWindow(size: number = this.config.windowDuration): string {
    const now = this.segments[this.segments.length - 1]?.timestamp || 0;
    const cutoff = now - size * 1000;

    const filteredSegments = this.segments.filter((s) => s.timestamp >= cutoff);
    const windowText = filteredSegments.map((s) => s.content).join(" ");

    this.logger.trace("Retrieved window", () => ({
      requestedSizeSeconds: size,
      actualSizeSeconds:
        filteredSegments.length > 0
          ? (now - filteredSegments[0].timestamp) / 1000
          : 0,
      totalSegments: this.segments.length,
      windowSegments: filteredSegments.length,
      windowWords: this.countWords(windowText),
      cutoffTimestamp: cutoff,
      nowTimestamp: now,
    }));

    return windowText;
  }

  getRange(start: number, end: number): string {
    return this.segments
      .filter((s) => s.timestamp >= start && s.timestamp <= end)
      .map((s) => s.content)
      .join(" ");
  }

  getLastNWords(n: number): string {
    const allText = this.segments.map((s) => s.content).join(" ");
    const segments = Array.from(this.segmenter.segment(allText));
    const words = segments.filter(segment =>
      segment.isWordLike && /\w/.test(segment.segment)
    );
    return words.slice(-n).map(w => w.segment).join("");
  }

  search(
    pattern: string,
    limit = 10,
  ): Array<{ content: string; timestamp: number }> {
    this.logger.debug("Starting buffer search", {
      pattern,
      limit,
      totalSegments: this.segments.length,
    });

    const results: Array<{ content: string; timestamp: number }> = [];
    const regex = new RegExp(pattern, "gi");
    let segmentsSearched = 0;

    for (const segment of this.segments.slice().reverse()) {
      segmentsSearched++;
      if (regex.test(segment.content)) {
        results.push({
          content: segment.content,
          timestamp: segment.timestamp,
        });
        if (results.length >= limit) break;
      }
    }

    this.logger.debug("Buffer search completed", {
      pattern,
      resultsFound: results.length,
      segmentsSearched,
      totalSegments: this.segments.length,
      limitReached: results.length >= limit,
    });

    return results;
  }

  clear(): void {
    const beforeStats = this.getStatistics();
    this.segments = [];
    this.position = 0;

    this.logger.debug("Buffer cleared", {
      previousSegmentCount: beforeStats.segmentCount,
      previousTotalWords: beforeStats.totalWords,
      previousOldestTimestamp: beforeStats.oldestTimestamp,
      previousNewestTimestamp: beforeStats.newestTimestamp,
    });
  }

  getStatistics(): BufferStats {
    if (this.segments.length === 0) {
      return {
        totalCharacters: 0,
        totalWords: 0,
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
    const totalWords = this.segments.reduce(
      (sum, s) => sum + this.countWords(s.content),
      0,
    );

    return {
      totalCharacters: totalChars,
      totalWords,
      segmentCount: this.segments.length,
      oldestTimestamp: this.segments[0].timestamp,
      newestTimestamp: this.segments[this.segments.length - 1].timestamp,
      averageSegmentSize: totalWords / this.segments.length,
    };
  }

  getRecentSegments(count: number): TextSegment[] {
    const recent = this.segments.slice(-count);

    this.logger.trace("Retrieved recent segments", {
      requestedCount: count,
      actualCount: recent.length,
      totalSegments: this.segments.length,
      recentWords: recent.reduce((sum, s) => sum + this.countWords(s.content), 0),
    });

    return recent;
  }
}
