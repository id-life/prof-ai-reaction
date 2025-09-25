import { nanoid } from "nanoid";
import { generateComment } from "./comment-gen/index.js";
import type { ApiKeys, Config } from "./config.js";
import { DecisionEngine } from "./decision-engine/index.js";
import { EventDetector } from "./event-detector/index.js";
import { TextBuffer } from "./text-buffer/service.js";
import type { Comment, Event, Turn } from "./type.js";

interface CommentSystemOptions {
  config: Config;
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
  private config: Config;
  private apiKeys: ApiKeys;
  private isProcessing = false;
  private pendingComment: NodeJS.Timeout | number | null = null;

  constructor(private options: CommentSystemOptions) {
    this.config = options.config;
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
    if (this.isProcessing) {
      this.debug("Already processing, skipping turn");
      return;
    }

    try {
      this.isProcessing = true;

      const turn: Turn = {
        id: data.id,
        content: data.content,
        startTime: data.startTime,
        endTime: data.endTime,
      };

      // Add to both buffers
      this.fullContextBuffer.append(turn);
      this.uncommentedBuffer.append(turn);

      // Get context from both buffers
      const fullContext = this.fullContextBuffer.getWindow();
      const uncommentedText = this.uncommentedBuffer.getWindow();

      // Detect events using uncommented text for better event detection
      const events = await this.eventDetector.detect(
        { turn, uncommentedText, fullContext },
        // { signal:  },
      );
      this.debug(
        `Detected ${events.length} events:`,
        JSON.stringify(events, null, 2),
      );

      // Make decision
      const decision = this.decisionEngine.evaluate(events, turn.endTime);
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
          await this.generateAndEmitComment(turn, events);
          this.pendingComment = null;
        }, decision.suggestedDelay);
      }
    } catch (error) {
      this.handleError(error as Error);
    } finally {
      this.isProcessing = false;
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
