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
import { TextBuffer } from "./text-buffer/service.js";
import type { Comment, Event, Turn } from "./type.js";

interface CommentSystemOptions {
  config?: ConfigInput;
  apiKeys: ApiKeys;
  onComment?: (comment: Comment) => void;
  onError?: (error: Error) => void;
  debug?: boolean;
}

export class CommentSystem implements Disposable {
  private fullContextBuffer: TextBuffer; // Stores entire conversation
  private uncommentedBuffer: TextBuffer; // Stores only uncommented portions
  private eventDetector: EventDetector;
  private decisionEngine: DecisionEngine;
  private detectionQueue: EventDetectionQueue;
  private config: Config;
  private apiKeys: ApiKeys;
  private pendingComment: NodeJS.Timeout | number | null = null;
  private static readonly MAX_TURN_STALENESS_MS = 5000; // Drop turns older than this

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
    };
    this.apiKeys = options.apiKeys;
    // Initialize components with separate buffers
    // Full context buffer with larger retention for complete conversation history
    this.fullContextBuffer = new TextBuffer(this.config.contextBuffer);

    // Uncommented buffer resets after each comment
    this.uncommentedBuffer = new TextBuffer(this.config.uncommentedBuffer);

    this.eventDetector = new EventDetector(
      this.config.eventDetector,
      this.options.apiKeys,
    );
    this.decisionEngine = new DecisionEngine(this.config.decisionEngine);

    this.detectionQueue = new EventDetectionQueue({
      process: async (job) => this.processJob(job),
      isStale: (job) => this.isTurnStale(job.turn),
      onDropStale: () => this.debug("Dropped stale queued turn"),
    });
  }

  /**
   * Process a completed turn and potentially generate a comment
   */
  async onTurnCompleted(data: {
    id: string;
    content: string;
    startTime: number;
    endTime: number;
  }): Promise<void> {
    const turn: Turn = {
      id: data.id,
      content: data.content,
      startTime: data.startTime,
      endTime: data.endTime,
    };

    // Always append incoming turns to buffers immediately
    this.fullContextBuffer.append(turn);
    this.uncommentedBuffer.append(turn);

    // Enqueue detection job; queue handles prefer-latest and staleness
    this.detectionQueue.enqueue({
      turn,
      fullContext: this.fullContextBuffer.getWindow(),
      uncommentedText: this.uncommentedBuffer.getWindow(),
    });
  }

  private isTurnStale(turn: Turn): boolean {
    return Date.now() - turn.endTime > CommentSystem.MAX_TURN_STALENESS_MS;
  }

  private async processJob(job: DetectionJob): Promise<void> {
    // Drop if too delayed
    if (this.isTurnStale(job.turn)) {
      this.debug("Turn too stale, dropping");
      return;
    }

    try {
      // Prefer job-provided snapshots; fallback to current buffers
      const fullContext = job.fullContext ?? this.fullContextBuffer.getWindow();
      const uncommentedText =
        job.uncommentedText ?? this.uncommentedBuffer.getWindow();

      // Detect events using uncommented text for better event detection
      const events = await this.eventDetector.detect({
        turn: job.turn,
        uncommentedText,
        fullContext,
      });
      this.debug(
        `Detected ${events.length} events:`,
        JSON.stringify(events, null, 2),
      );

      // Make decision
      const decision = this.decisionEngine.evaluate(events, job.turn.endTime);
      this.debug(
        `Decision: ${decision.shouldComment ? "YES" : "NO"} (score: ${decision.score.toFixed(2)})`,
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
    } catch (error) {
      this.handleError(error as Error);
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

      const commentResponse = await generateComment(context, {
        ...this.config.commentGenerator,
        apiKeys: this.apiKeys,
        // signal:
      });

      for await (const chunk of commentResponse) {
        if (chunk.type === "agent_updated_stream_event") {
          this.debug(`Agent updated: ${chunk.agent.name}`);
        } else if (chunk.type === "run_item_stream_event") {
          this.debug(`Run item: ${chunk.name}, ${chunk.item}`);
        } else if (chunk.type === "raw_model_stream_event") {
          this.debug(`Raw model: ${chunk.data}`);
        }
      }
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
      this.options.onComment?.(comment);

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
    if (this.options.onError) {
      this.options.onError(error);
    }
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
