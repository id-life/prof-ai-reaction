import { getLogger } from "@logtape/logtape";
import type { TextSegment, Turn } from "../type.js";
import type { BufferStats, TextBufferConfig } from "./def.js";

export class TextBuffer {
  private segments: TextSegment[] = [];
  private position = 0;
  private logger = getLogger(["ai-reaction", "text-buffer"]);

  constructor(private config: TextBufferConfig) {}

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
      bufferSizeCharacters: this.segments.reduce(
        (sum, s) => sum + s.content.length,
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
      windowCharacters: windowText.length,
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

  getLastNCharacters(n: number): string {
    const text = this.segments.map((s) => s.content).join(" ");
    return text.slice(-n);
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
      previousTotalCharacters: beforeStats.totalCharacters,
      previousOldestTimestamp: beforeStats.oldestTimestamp,
      previousNewestTimestamp: beforeStats.newestTimestamp,
    });
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
    const recent = this.segments.slice(-count);

    this.logger.trace("Retrieved recent segments", {
      requestedCount: count,
      actualCount: recent.length,
      totalSegments: this.segments.length,
      recentCharacters: recent.reduce((sum, s) => sum + s.content.length, 0),
    });

    return recent;
  }
}
