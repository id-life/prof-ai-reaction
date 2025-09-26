import { getLogger } from "@logtape/logtape";
import { delay } from "@std/async";
import { createNanoEvents } from "nanoevents";
import { nanoid } from "nanoid";
import { generateComment } from "./comment-gen/index.js";
import {
  type ApiKeys,
  type Config,
  type ConfigInput,
  defaultCommentGeneratorConfig,
  defaultContextBufferConfig,
  defaultDecisionEngineConfig,
  defaultEventDetectorConfig,
  defaultShortTurnAggregatorConfig,
  defaultUncommentedBufferConfig,
} from "./config.js";
import { DecisionEngine } from "./decision-engine/index.js";
import {
  type DetectionJob,
  EventDetectionQueue,
  EventDetector,
} from "./event-detector/index.js";
import { TextBuffer } from "./text-buffer/service.js";
import { ShortTurnAggregator } from "./turn-agg/service.js";
import type { Comment, Event, Turn } from "./type.js";

export interface CommentSystemEvents {
  "comment-started": (
    response: Awaited<ReturnType<typeof generateComment>>,
  ) => void;
  "comment-rejected": (reason: string) => void;
  "comment-generated": (comment: Comment) => void;
  error: (error: unknown) => void;
}

interface CommentSystemOptions {
  config?: ConfigInput;
  apiKeys: ApiKeys;
}

export class CommentSystem implements Disposable {
  private fullContextBuffer: TextBuffer; // Stores entire conversation
  private uncommentedBuffer: TextBuffer; // Stores only uncommented portions
  private shortTurnAggregator: ShortTurnAggregator; // Aggregates nearby short turns
  private eventDetector: EventDetector;
  private decisionEngine: DecisionEngine;
  private detectionQueue: EventDetectionQueue;
  private config: Config;
  private apiKeys: ApiKeys;
  private pendingComment: AbortController | null = null;
  private emitter = createNanoEvents<CommentSystemEvents>();
  private static readonly MAX_TURN_STALENESS_MS = 5000; // Drop turns older than this
  private logger = getLogger(["ai-reaction", "comment-system"]);

  on<E extends keyof CommentSystemEvents>(
    event: E,
    listener: CommentSystemEvents[E],
  ): void {
    this.emitter.on(event, listener);
  }

  constructor(private options: CommentSystemOptions) {
    this.config = {
      apiKeys: options.apiKeys,
      commentGenerator: {
        ...defaultCommentGeneratorConfig,
        ...options.config?.commentGenerator,
      },
      decisionEngine: {
        ...defaultDecisionEngineConfig,
        ...options.config?.decisionEngine,
      },
      eventDetector: {
        ...defaultEventDetectorConfig,
        ...options.config?.eventDetector,
      },
      contextBuffer: {
        ...defaultContextBufferConfig,
        ...options.config?.contextBuffer,
      },
      uncommentedBuffer: {
        ...defaultUncommentedBufferConfig,
        ...options.config?.uncommentedBuffer,
      },
      shortTurnAggregator: {
        ...defaultShortTurnAggregatorConfig,
        ...options.config?.shortTurnAggregator,
      },
    };
    this.apiKeys = options.apiKeys;
    // Initialize components with separate buffers
    // Full context buffer with larger retention for complete conversation history
    this.fullContextBuffer = new TextBuffer(this.config.contextBuffer);

    // Uncommented buffer resets after each comment
    this.uncommentedBuffer = new TextBuffer(this.config.uncommentedBuffer);
    this.shortTurnAggregator = new ShortTurnAggregator(
      this.config.shortTurnAggregator,
    );
    this.shortTurnAggregator.on("timeout", (bufferedTurn) => {
      this.logger.debug("Short turn aggregator timeout triggered", () => ({
        turnId: bufferedTurn.id,
        turnContent: bufferedTurn.content.substring(0, 100),
        startTime: bufferedTurn.startTime,
        endTime: bufferedTurn.endTime,
        duration: bufferedTurn.endTime - bufferedTurn.startTime,
      }));

      // Enqueue using current buffers' snapshots
      this.detectionQueue.enqueue({
        turn: bufferedTurn,
        fullContext: this.fullContextBuffer.getWindow(),
        uncommentedText: this.uncommentedBuffer.getWindow(),
      });
    });

    this.eventDetector = new EventDetector(
      this.config.eventDetector,
      this.options.apiKeys,
    );
    this.decisionEngine = new DecisionEngine(this.config.decisionEngine);

    this.detectionQueue = new EventDetectionQueue({
      process: async (job) => {
        this.logger.debug("Processing detection job", () => ({
          jobTurnId: job.turn.id,
          turnContent: job.turn.content.substring(0, 50),
          enqueuedAtMs: job.enqueuedAtMs,
          queueDelayMs: Date.now() - job.enqueuedAtMs,
          fullContextLength: job.fullContext?.length,
          uncommentedTextLength: job.uncommentedText?.length,
        }));
        await this.processJob(job);
      },
      isStale: (job) => {
        const stale = this.isTurnStale(job.turn, job.enqueuedAtMs);
        this.logger.debug("Staleness check for job", () => ({
          jobTurnId: job.turn.id,
          enqueuedAtMs: job.enqueuedAtMs,
          ageMs: Date.now() - job.enqueuedAtMs,
          maxStaleMs: CommentSystem.MAX_TURN_STALENESS_MS,
          stale,
        }));
        return stale;
      },
      onDropStale: (job) =>
        this.logger.info("Dropped stale queued turn", {
          jobTurnId: job.turn.id,
          enqueuedAtMs: job.enqueuedAtMs,
          ageMs: Date.now() - job.enqueuedAtMs,
        }),
    });
    this.detectionQueue.on("error", (error, job) => {
      this.logger.error("Detection queue error: {message}", {
        error: error,
        message: error.message,
        jobTurnId: job.turn.id,
        enqueuedAtMs: job.enqueuedAtMs,
        queueDelayMs: Date.now() - job.enqueuedAtMs,
      });
      this.emitter.emit("error", error);
    });
  }

  /**
   * Process a completed turn and potentially generate a comment
   */
  onTurnCompleted(data: Turn): void {
    const turn: Turn = {
      id: data.id,
      content: data.content,
      startTime: data.startTime,
      endTime: data.endTime,
    };

    this.logger.debug("Turn completed", () => ({
      turnId: turn.id,
      contentLength: turn.content?.length ?? 0,
      duration: turn.endTime - turn.startTime,
      contentPreview: turn.content?.substring(0, 50) ?? "",
    }));

    // Always append incoming turns to buffers immediately
    this.fullContextBuffer.append(turn);
    this.uncommentedBuffer.append(turn);

    this.logger.trace("Updated buffers with turn", () => ({
      turnId: turn.id,
      fullContextStats: this.fullContextBuffer.getStatistics(),
      uncommentedStats: this.uncommentedBuffer.getStatistics(),
    }));

    // Gate by minimal turn duration via aggregator
    const minDuration = this.config.shortTurnAggregator.minTurnDurationMs;
    let readyTurn: Turn | null = null;
    // Convert seconds to milliseconds for comparison against ms config
    const turnDurationMs = (turn.endTime - turn.startTime) * 1000;

    if (turnDurationMs >= minDuration) {
      // Long enough by duration; also reset any pending aggregation
      this.logger.debug("Turn meets minimum duration threshold", {
        turnId: turn.id,
        durationMs: turnDurationMs,
        minDurationMs: minDuration,
      });
      this.shortTurnAggregator.clear();
      readyTurn = turn;
    } else {
      this.logger.trace("Turn too short, adding to aggregator", {
        turnId: turn.id,
        durationMs: turnDurationMs,
        minDurationMs: minDuration,
      });
      readyTurn = this.shortTurnAggregator.add(turn);
    }

    if (!readyTurn) {
      this.logger.trace("No ready turn after aggregation, waiting", {
        originalTurnId: turn.id,
      });
      return; // Not ready yet
    }

    this.logger.debug("Enqueueing detection job", () => ({
      readyTurnId: readyTurn!.id,
      contentLength: readyTurn!.content?.length ?? 0,
      fullContextLength: this.fullContextBuffer.getWindow().length,
      uncommentedTextLength: this.uncommentedBuffer.getWindow().length,
    }));

    // Enqueue detection job; queue handles prefer-latest and staleness
    this.detectionQueue.enqueue({
      turn: readyTurn,
      fullContext: this.fullContextBuffer.getWindow(),
      uncommentedText: this.uncommentedBuffer.getWindow(),
    });
  }

  private isTurnStale(_turn: Turn, enqueuedAtMs?: number): boolean {
    // Determine staleness based on wall-clock enqueue time only.
    // Turn timestamps are media-relative (seconds) and are not comparable to epoch ms.
    if (enqueuedAtMs === undefined) return false;
    return Date.now() - enqueuedAtMs > CommentSystem.MAX_TURN_STALENESS_MS;
  }

  private async processJob(job: DetectionJob): Promise<void> {
    // Drop if too delayed
    if (this.isTurnStale(job.turn, job.enqueuedAtMs)) {
      this.logger.info("Turn too stale, dropping", () => ({
        jobTurnId: job.turn.id,
        enqueuedAtMs: job.enqueuedAtMs,
      }));
      return;
    }
    this.logger.debug("Starting event detection", () => ({
      turnId: job.turn.id,
      contentLength: job.turn.content?.length ?? 0,
      endTime: job.turn.endTime,
      fullContextLength: job.fullContext?.length,
      uncommentedTextLength: job.uncommentedText?.length,
    }));

    const detectionStart = performance.now();
    const events = await this.eventDetector.detect(job);
    const detectionTimeMs = performance.now() - detectionStart;

    this.logger.info("Event detection completed", {
      turnId: job.turn.id,
      eventsDetected: events.length,
      detectionTimeMs: Math.round(detectionTimeMs),
      eventTypes: events.map((e) => e.type),
      avgConfidence:
        events.length > 0
          ? (
              events.reduce((sum, e) => sum + e.confidence, 0) / events.length
            ).toFixed(2)
          : 0,
    });

    // Make decision
    const decisionStart = performance.now();
    const decision = this.decisionEngine.evaluate(events, job.turn.endTime);
    const decisionTimeMs = performance.now() - decisionStart;

    this.logger.info("Decision: {decision}", {
      decision: decision.shouldComment ? "COMMENT" : "SKIP",
      score: parseFloat(decision.score.toFixed(2)),
      confidence: parseFloat(decision.confidence.toFixed(2)),
      priority: decision.priority,
      suggestedDelayMs: decision.suggestedDelay,
      reasoning: decision.reasoning,
      factors: decision.factors,
      decisionTimeMs: Math.round(decisionTimeMs),
      turnId: job.turn.id,
    });

    // Generate comment if decided
    if (decision.shouldComment) {
      // Cancel any pending comment
      if (this.pendingComment) {
        this.logger.debug("Cancelling previous pending comment", {
          turnId: job.turn.id,
        });
        this.pendingComment.abort();
        this.pendingComment = null;
      }

      this.logger.info("Scheduling comment generation", {
        turnId: job.turn.id,
        delayMs: decision.suggestedDelay,
        priority: decision.priority,
      });

      // Schedule comment generation with suggested delay
      this.pendingComment = new AbortController();
      try {
        await delay(decision.suggestedDelay, {
          signal: this.pendingComment.signal,
        });
        await this.generateAndEmitComment(job.turn, events);
      } finally {
        this.pendingComment = null;
      }
    }
  }

  private async generateAndEmitComment(
    turn: Turn,
    events: Event[],
  ): Promise<void> {
    try {
      // Use both full context and uncommented text for generation
      const contextForGen = {
        fullContext: this.fullContextBuffer.getWindow(),
        uncommentedText: this.uncommentedBuffer.getWindow(),
      };

      const context = {
        currentText: turn.content,
        historicalText: contextForGen.fullContext, // Use full conversation context
        uncommentedText: contextForGen.uncommentedText, // New: provide uncommented portion
        events,
        previousComments: [],
      };

      const startCommentTime = performance.now();

      this.logger.info("Starting comment generation", () => ({
        turnId: turn.id,
        currentTextLength: context.currentText.length,
        historicalTextLength: context.historicalText.length,
        uncommentedTextLength: context.uncommentedText.length,
        events: events.map((e) => ({ type: e.type, confidence: e.confidence })),
        eventCount: events.length,
      }));

      const commentResponse = await generateComment(context, {
        ...this.config.commentGenerator,
        apiKeys: this.apiKeys,
        // signal:
      });

      this.emitter.emit("comment-started", commentResponse);

      // for await (const chunk of commentResponse) {
      //   if (chunk.type === "agent_updated_stream_event") {
      //     this.logger.debug(`Agent updated: ${chunk.agent.name}`);
      //   } else if (chunk.type === "run_item_stream_event") {
      //     this.logger.debug(`Run item: ${chunk.name}, ${JSON.stringify(chunk.item.toJSON())}`);
      //   } else if (chunk.type === "raw_model_stream_event") {
      //     this.logger.debug(`Raw model: ${JSON.stringify(chunk.data)}`);
      //   }
      // }
      await commentResponse.completed;
      const commentResult = commentResponse.finalOutput!;

      if (commentResult.reject) {
        this.logger.warn("Comment rejected by generator", {
          reason: commentResult.reason,
          turnId: turn.id,
          generationTimeMs: Math.round(performance.now() - startCommentTime),
        });
        this.emitter.emit("comment-rejected", commentResult.reason);
        return;
      }

      if (!commentResult.content) {
        this.logger.warn("Comment generation produced empty content", {
          turnId: turn.id,
          generationTimeMs: Math.round(performance.now() - startCommentTime),
        });
        return;
      }

      const comment: Comment = {
        content: commentResult.content,
        writer: commentResponse.lastAgent?.name || "",
        length: commentResult.content.length,
        id: nanoid(),
        generationTime: performance.now() - startCommentTime,
        metadata: {
          timestamp: turn.endTime,
        },
      };

      // Update decision engine history
      this.decisionEngine.updateHistory(comment);

      // Reset uncommented buffer after generating comment
      this.uncommentedBuffer.clear();

      // Emit comment
      this.emitter.emit("comment-generated", comment);

      this.logger.info("Comment generated successfully", () => ({
        commentId: comment.id,
        writer: comment.writer,
        length: comment.length,
        generationTimeMs: Math.round(comment.generationTime),
        timestamp: comment.metadata?.timestamp,
        turnId: turn.id,
        contentPreview: comment.content.substring(0, 100),
        bufferStatsBeforeReset: this.uncommentedBuffer.getStatistics(),
      }));
    } catch (error) {
      this.emitter.emit("error", error);
    }
  }

  /**
   * Get current statistics
   */
  getStatistics() {
    return {
      fullContextBuffer: this.fullContextBuffer.getStatistics(),
      uncommentedBuffer: this.uncommentedBuffer.getStatistics(),
      config: this.config,
    };
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.fullContextBuffer.clear();
    this.uncommentedBuffer.clear();
    this.shortTurnAggregator.clear();
    if (this.pendingComment) {
      this.pendingComment.abort();
      this.pendingComment = null;
    }
  }

  /**
   * Destroy the system and clean up
   */
  [Symbol.dispose](): void {
    this.clear();
  }
}

/**
 * Factory function to create a comment system
 */
export function createCommentSystem(
  options: CommentSystemOptions,
): CommentSystem {
  return new CommentSystem(options);
}
