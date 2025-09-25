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
  defaultUncommentedBufferConfig,
} from "./config.js";
import { DecisionEngine } from "./decision-engine/index.js";
import {
  type DetectionJob,
  EventDetectionQueue,
  EventDetector,
} from "./event-detector/index.js";
import { defaultShortTurnAggregationConfig } from "./text-buffer/def.js";
import { ShortTurnAggregator, TextBuffer } from "./text-buffer/service.js";
import type { Comment, Event, Turn } from "./type.js";

export interface CommentSystemEvents {
  "comment-generated": (comment: Comment) => void;
  error: (error: Error) => void;
}

interface CommentSystemOptions {
  config?: ConfigInput;
  apiKeys: ApiKeys;
  debug?: boolean;
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
  private pendingComment: NodeJS.Timeout | number | null = null;
  private emitter = createNanoEvents<CommentSystemEvents>();
  private static readonly MAX_TURN_STALENESS_MS = 5000; // Drop turns older than this

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
        ...defaultShortTurnAggregationConfig,
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
        // console.log("[detection-queue] processing job", job);
        await this.processJob(job);
      },
      isStale: (job) => {
        // console.log("[detection-queue] checking if job is stale", job);
        return this.isTurnStale(job.turn, job.enqueuedAtMs);
      },
      onDropStale: () =>
        this.debug("[detection-queue] dropped stale queued turn"),
    });
    this.detectionQueue.on("error", (error, job) => {
      console.error("[detection-queue] error", error, job.turn.id);
      this.handleError(error);
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

    // Always append incoming turns to buffers immediately
    this.fullContextBuffer.append(turn);
    this.uncommentedBuffer.append(turn);

    // Gate by minimal turn duration via aggregator
    const minDuration = this.config.shortTurnAggregator.minTurnDurationMs;
    let readyTurn: Turn | null = null;
    // Convert seconds to milliseconds for comparison against ms config
    if ((turn.endTime - turn.startTime) * 1000 >= minDuration) {
      // Long enough by duration; also reset any pending aggregation
      this.shortTurnAggregator.clear();
      readyTurn = turn;
    } else {
      readyTurn = this.shortTurnAggregator.add(turn);
    }

    if (!readyTurn) return; // Not ready yet

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
    // this.debug(
    //   "[detection-queue] processing job",
    //   job.turn.id,
    //   job.enqueuedAtMs,
    //   this.isTurnStale(job.turn, job.enqueuedAtMs),
    // );
    if (this.isTurnStale(job.turn, job.enqueuedAtMs)) {
      this.debug("Turn too stale, dropping");
      return;
    }
    this.debug("[detect] Detecting events", job.turn);
    const events = await this.eventDetector.detect(job);
    this.debug(
      `[detect] Detected ${events.length} events:`,
      JSON.stringify(events, null, 2),
    );

    // Make decision
    const decision = this.decisionEngine.evaluate(events, job.turn.endTime);
    this.debug(
      `[decision] ${decision.shouldComment ? "YES" : "NO"} (score: ${decision.score.toFixed(2)})`,
    );

    // Generate comment if decided
    if (decision.shouldComment) {
      // Cancel any pending comment
      if (this.pendingComment) {
        clearTimeout(this.pendingComment);
        this.pendingComment = null;
      }

      // Schedule comment generation with suggested delay
      this.pendingComment = setTimeout(async () => {
        await this.generateAndEmitComment(job.turn, events);
        this.pendingComment = null;
      }, decision.suggestedDelay);
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

      this.debug("[comment-gen] Generating comment", context);

      const commentResponse = await generateComment(context, {
        ...this.config.commentGenerator,
        apiKeys: this.apiKeys,
        // signal:
      });

      // for await (const chunk of commentResponse) {
      //   if (chunk.type === "agent_updated_stream_event") {
      //     this.debug(`Agent updated: ${chunk.agent.name}`);
      //   } else if (chunk.type === "run_item_stream_event") {
      //     this.debug(`Run item: ${chunk.name}, ${JSON.stringify(chunk.item.toJSON())}`);
      //   } else if (chunk.type === "raw_model_stream_event") {
      //     this.debug(`Raw model: ${JSON.stringify(chunk.data)}`);
      //   }
      // }
      await commentResponse.completed;
      const commentResult = commentResponse.finalOutput!;

      if (commentResult.reject) {
        this.debug(`Comment rejected: ${commentResult.reason}`);
        return;
      }

      if (!commentResult.content) {
        this.debug(`Comment is empty`);
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

      this.debug(`Generated comment: "${comment.content}"`);
    } catch (error) {
      this.handleError(error as Error);
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
      clearTimeout(this.pendingComment);
      this.pendingComment = null;
    }
  }

  /**
   * Destroy the system and clean up
   */
  [Symbol.dispose](): void {
    this.clear();
  }

  private debug(...args: unknown[]): void {
    if (this.options.debug) {
      console.log("[CommentSystem]", ...args);
    }
  }

  private handleError(error: Error): void {
    this.debug("Error:", error);
    this.emitter.emit("error", error);
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
