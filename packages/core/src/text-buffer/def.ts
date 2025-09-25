export interface TextBufferConfig {
  /** in characters */
  bufferSize: number;
  /** in seconds */
  windowDuration: number;
  /** in characters */
  segmentMaxSize: number;
  /** in seconds */
  retentionTime: number;
  /** Minimal duration required to consider a turn ready (ms) */
  minTurnDurationMs: number;
  /** Max time to wait to aggregate short turns before clearing (ms) */
  aggregationMaxDelayMs: number;
  /** Max allowed gap between short turns to aggregate as siblings (ms) */
  aggregationMaxGapMs: number;
}

export interface BufferStats {
  totalCharacters: number;
  segmentCount: number;
  oldestTimestamp: number;
  newestTimestamp: number;
  averageSegmentSize: number;
}

export const defaultTextBufferConfig: TextBufferConfig = {
  bufferSize: 100000,
  windowDuration: 30,
  segmentMaxSize: 100,
  retentionTime: 300,
  minTurnDurationMs: 1200,
  aggregationMaxDelayMs: 800,
  aggregationMaxGapMs: 400,
};
