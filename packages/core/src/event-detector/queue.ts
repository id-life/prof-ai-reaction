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

  on<E extends keyof EventDetectionQueueEvents>(
    event: E,
    listener: EventDetectionQueueEvents[E],
  ): void {
    this.emitter.on(event, listener);
  }

  constructor(private options: QueueOptions) {}

  enqueue(job: Omit<DetectionJob, "enqueuedAtMs">): void {
    const withTimestamp: DetectionJob = { ...job, enqueuedAtMs: Date.now() };
    this.pendingJob = withTimestamp;
    // Fire-and-forget start
    void this.processNext();
  }

  clear(): void {
    this.pendingJob = null;
  }

  private async processNext(): Promise<void> {
    console.log("[event-detector] processing next", {
      processing: this.processing,
      pendingJob: this.pendingJob?.turn.id,
    });
    if (this.processing) return;
    this.processing = true;
    try {
      // Drain loop: always process only the latest pending job
      // and drop stale ones based on provided policy.
      // No abort of in-flight processing.
      while (true) {
        const job = this.pendingJob;
        this.pendingJob = null;
        if (!job) break;

        if (this.options.isStale?.(job)) {
          this.options.onDropStale?.(job);
          continue;
        }

        await this.options.process(job).catch((err) => {
          this.emitter.emit("error", err, job);
        });
      }
    } finally {
      this.processing = false;
    }
  }
}
