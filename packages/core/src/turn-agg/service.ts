import { getLogger } from "@logtape/logtape";
import { createNanoEvents } from "nanoevents";
import type { Turn } from "../type.js";
import type { ShortTurnAggregatorConfig } from "./def.js";

export interface ShortTurnAggregatorEvents {
  timeout: (turn: Turn) => void;
}

export class ShortTurnAggregator implements Disposable {
  private logger = getLogger(["ai-reaction", "short-turn-aggregator"]);
  private bufferedContent = "";
  private bufferedStartTime = 0;
  private lastTurnEndTime = 0;
  private timeoutHandle: number | NodeJS.Timeout | null = null;
  private emitter = createNanoEvents<ShortTurnAggregatorEvents>();
  private segmenter: Intl.Segmenter | null = null;
  private aggregatedWordCount = 0;

  constructor(private config: ShortTurnAggregatorConfig) {
    // Try to construct a word segmenter; fall back gracefully
    try {
      // Use "word" granularity; locale-agnostic by default
      this.segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    } catch {
      this.segmenter = null;
    }
  }

  /**
   * Add a turn; returns an aggregated synthetic turn when threshold met or timeout previously fired.
   * If returns null, caller should not process yet.
   */
  add(turn: Turn): Turn | null {
    const content = turn.content ?? "";

    // If there is no active buffer, start one.
    const hasActiveBuffer = this.bufferedContent.length > 0;
    // Convert media-relative seconds to milliseconds when comparing against ms config
    const gapMs = hasActiveBuffer
      ? (turn.startTime - this.lastTurnEndTime) * 1000
      : 0;
    const tooFarFromPrevious =
      hasActiveBuffer && gapMs > this.config.aggregationMaxGapMs;

    this.logger.trace("Adding turn to aggregator", () => ({
      turnId: turn.id,
      contentLength: content.length,
      hasActiveBuffer,
      gapMs,
      maxGapMs: this.config.aggregationMaxGapMs,
      tooFarFromPrevious,
      currentBufferedLength: this.bufferedContent.length,
      currentWordCount: this.aggregatedWordCount,
    }));

    if (!hasActiveBuffer || tooFarFromPrevious) {
      if (tooFarFromPrevious) {
        this.logger.debug("Turn gap too large, resetting buffer", {
          turnId: turn.id,
          gapMs,
          maxGapMs: this.config.aggregationMaxGapMs,
        });
      }
      this.resetBuffer();
      this.bufferedStartTime = turn.startTime;
    }

    // Append with a separating space if needed
    const previousContentLength = this.bufferedContent.length;
    this.bufferedContent = this.bufferedContent
      ? `${this.bufferedContent} ${content}`
      : content;

    // Update word count
    const previousWordCount = this.aggregatedWordCount;
    this.aggregatedWordCount = this.countWords(this.bufferedContent);
    this.lastTurnEndTime = turn.endTime;

    const elapsedMs =
      this.bufferedStartTime > 0
        ? (this.lastTurnEndTime - this.bufferedStartTime) * 1000
        : 0;

    const durationReached =
      this.bufferedStartTime > 0 && elapsedMs >= this.config.minTurnDurationMs;

    const maxWords = this.config.aggregationMaxWords ?? 0;
    const wordLimitReached =
      maxWords > 0 && this.aggregatedWordCount >= maxWords;

    const maxTotalDuration = this.config.aggregationMaxTotalDurationMs ?? 0;
    const totalDurationExceeded =
      maxTotalDuration > 0 && elapsedMs >= maxTotalDuration;

    this.logger.trace("Updated aggregator state", () => ({
      turnId: turn.id,
      bufferedContentLength: this.bufferedContent.length,
      contentLengthChange: this.bufferedContent.length - previousContentLength,
      wordCount: this.aggregatedWordCount,
      wordCountChange: this.aggregatedWordCount - previousWordCount,
      elapsedMs,
      thresholds: {
        durationReached: {
          value: durationReached,
          threshold: this.config.minTurnDurationMs,
        },
        wordLimitReached: { value: wordLimitReached, threshold: maxWords },
        totalDurationExceeded: {
          value: totalDurationExceeded,
          threshold: maxTotalDuration,
        },
      },
    }));

    // If any threshold reached, emit immediately and clear
    if (durationReached || wordLimitReached || totalDurationExceeded) {
      const reasons = [];
      if (durationReached) reasons.push("duration");
      if (wordLimitReached) reasons.push("word limit");
      if (totalDurationExceeded) reasons.push("total duration");

      this.logger.debug("Aggregation threshold reached, emitting turn", {
        triggerReasons: reasons,
        aggregatedTurnId: turn.id,
        finalContentLength: this.bufferedContent.length,
        finalWordCount: this.aggregatedWordCount,
        totalElapsedMs: elapsedMs,
        bufferedFromStartTime: this.bufferedStartTime,
        bufferedToEndTime: this.lastTurnEndTime,
      });

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

    // Otherwise schedule (or reschedule) a debounce timeout so we flush after inactivity
    this.clearTimeout();
    this.timeoutHandle = setTimeout(() => {
      const pending = this.peek();
      if (pending) {
        this.logger.debug(
          "Aggregation timeout reached, emitting buffered turn",
          {
            turnId: pending.id,
            bufferedContent: pending.content.substring(0, 100),
            wordCount: this.aggregatedWordCount,
            elapsedMs: (pending.endTime - pending.startTime) * 1000,
            timeoutMs: this.config.aggregationMaxDelayMs,
          },
        );
        this.emitter.emit("timeout", pending);
      }
      this.clearTimeout();
      this.resetBuffer();
    }, this.config.aggregationMaxDelayMs);

    this.logger.trace("Scheduled aggregation timeout", {
      turnId: turn.id,
      delayMs: this.config.aggregationMaxDelayMs,
      bufferedContentLength: this.bufferedContent.length,
      wordCount: this.aggregatedWordCount,
    });

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
    if (!this.bufferedContent) {
      this.logger.trace("Flush called but no buffered content");
      return null;
    }

    const turn: Turn = {
      id: `${this.bufferedStartTime}`,
      content: this.bufferedContent,
      startTime: this.bufferedStartTime,
      endTime: this.lastTurnEndTime,
    };

    this.logger.debug("Flushing buffered turn", {
      turnId: turn.id,
      contentLength: turn.content.length,
      wordCount: this.aggregatedWordCount,
      elapsedMs: (turn.endTime - turn.startTime) * 1000,
      wasForced: true,
    });

    this.clearTimeout();
    this.resetBuffer();
    return turn;
  }

  clear(): void {
    const hadContent = this.bufferedContent.length > 0;
    if (hadContent) {
      this.logger.debug("Clearing aggregator", {
        discardedContentLength: this.bufferedContent.length,
        discardedWordCount: this.aggregatedWordCount,
        elapsedMs:
          this.bufferedStartTime > 0 && this.lastTurnEndTime > 0
            ? (this.lastTurnEndTime - this.bufferedStartTime) * 1000
            : 0,
      });
    }
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
    this.aggregatedWordCount = 0;
    this.logger.trace("Buffer reset");
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private countWords(text: string): number {
    if (!text) return 0;
    // If Segmenter is available, count segments marked as words
    if (this.segmenter) {
      type WordSegment = { segment: string; isWordLike?: boolean };
      const iterable = this.segmenter.segment(
        text,
      ) as unknown as Iterable<WordSegment>;
      let count = 0;
      for (const seg of iterable) {
        const segText: string = seg.segment;
        const isWordLike: boolean =
          seg.isWordLike ?? /[\p{L}\p{N}]/u.test(segText);
        if (isWordLike) count++;
      }
      return count;
    }
    // Fallback: Unicode-aware counting
    // - Count individual CJK characters
    // - Count contiguous sequences of letters/numbers for non-CJK
    const cjkMatches =
      text.match(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
      ) || [];
    const nonCjk = text.replace(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
      " ",
    );
    const latinWordMatches = nonCjk.match(/[\p{L}\p{N}]+/gu) || [];
    return cjkMatches.length + latinWordMatches.length;
  }
}
