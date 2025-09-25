import { getLogger } from "@logtape/logtape";
import { createNanoEvents } from "nanoevents";
import type { Turn } from "../type.js";

export interface DetectionJob {
  turn: Turn;
  uncommentedText: string;
  fullContext?: string;
  /** Wall-clock timestamp (ms) when this job was enqueued. */
  enqueuedAtMs: number;
}

type QueueOptions = {
  process: (job: DetectionJob) => Promise<void>;
  isStale?: (job: DetectionJob) => boolean;
  onDropStale?: (job: DetectionJob) => void;
};

export interface EventDetectionQueueEvents {
  error: (error: Error, job: DetectionJob) => void;
}

/**
 * Single-slot in-memory queue that prefers the most recent job.
 * If multiple jobs are added while processing, only the last one is kept.
 */
export class EventDetectionQueue {
  private processing = false;
  private pendingJob: DetectionJob | null = null;
  private emitter = createNanoEvents<EventDetectionQueueEvents>();
  private logger = getLogger(["ai-reaction", "event-detection-queue"]);

  on<E extends keyof EventDetectionQueueEvents>(
    event: E,
    listener: EventDetectionQueueEvents[E],
  ): void {
    this.emitter.on(event, listener);
  }

  constructor(private options: QueueOptions) {}

  enqueue(job: Omit<DetectionJob, "enqueuedAtMs">): void {
    const withTimestamp: DetectionJob = { ...job, enqueuedAtMs: Date.now() };

    if (this.pendingJob) {
      this.logger.debug("Replacing pending job with newer one", {
        oldJobTurnId: this.pendingJob.turn.id,
        newJobTurnId: job.turn.id,
        oldJobAgeMs: Date.now() - this.pendingJob.enqueuedAtMs,
      });
    }

    this.pendingJob = withTimestamp;

    this.logger.debug("Job enqueued", {
      turnId: job.turn.id,
      contentLength: job.turn.content?.length ?? 0,
      fullContextLength: job.fullContext?.length,
      uncommentedTextLength: job.uncommentedText?.length,
      enqueuedAtMs: withTimestamp.enqueuedAtMs,
      isProcessing: this.processing,
    });

    // Fire-and-forget start
    void this.processNext();
  }

  clear(): void {
    if (this.pendingJob) {
      this.logger.debug("Clearing pending job", {
        turnId: this.pendingJob.turn.id,
        ageMs: Date.now() - this.pendingJob.enqueuedAtMs,
      });
    }
    this.pendingJob = null;
  }

  private async processNext(): Promise<void> {
    this.logger.trace("Processing next job check", () => ({
      processing: this.processing,
      hasPendingJob: !!this.pendingJob,
      pendingJobTurnId: this.pendingJob?.turn.id,
    }));

    if (this.processing) {
      this.logger.trace("Already processing, skipping");
      return;
    }

    this.processing = true;
    this.logger.debug("Started processing queue");

    try {
      let processedCount = 0;
      let droppedCount = 0;

      // Drain loop: always process only the latest pending job
      // and drop stale ones based on provided policy.
      // No abort of in-flight processing.
      while (true) {
        const job = this.pendingJob;
        this.pendingJob = null;

        if (!job) {
          this.logger.debug("Queue drained", {
            processedCount,
            droppedCount,
          });
          break;
        }

        const jobAgeMs = Date.now() - job.enqueuedAtMs;

        if (this.options.isStale?.(job)) {
          droppedCount++;
          this.logger.debug("Dropping stale job", {
            turnId: job.turn.id,
            ageMs: jobAgeMs,
            enqueuedAtMs: job.enqueuedAtMs,
          });
          this.options.onDropStale?.(job);
          continue;
        }

        this.logger.debug("Processing job", {
          turnId: job.turn.id,
          ageMs: jobAgeMs,
          contentLength: job.turn.content?.length ?? 0,
        });

        const processStart = performance.now();
        await this.options.process(job).catch((err) => {
          const processTimeMs = performance.now() - processStart;
          this.logger.error("Job processing error: {message}", {
            message: (err as Error)?.message,
            name: (err as Error)?.name,
            stack: (err as Error)?.stack,
            jobTurnId: job.turn.id,
            enqueuedAtMs: job.enqueuedAtMs,
            ageMs: jobAgeMs,
            processTimeMs: Math.round(processTimeMs),
          });
          this.emitter.emit("error", err as Error, job);
        });

        const processTimeMs = performance.now() - processStart;
        processedCount++;

        this.logger.debug("Job processed successfully", {
          turnId: job.turn.id,
          processTimeMs: Math.round(processTimeMs),
          ageMs: jobAgeMs,
        });
      }
    } finally {
      this.processing = false;
      this.logger.debug("Finished processing queue");
    }
  }
}
