export interface TextBufferConfig {
  /** in characters */
  bufferSize: number;
  /** in seconds */
  windowDuration: number;
  /** in characters */
  segmentMaxSize: number;
  /** in seconds */
  retentionTime: number;
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
};

export interface ShortTurnAggregationConfig {
  /** Minimal duration required to consider a turn ready (ms) */
  minTurnDurationMs: number;
  /** Max time to wait to aggregate short turns before clearing (ms) */
  aggregationMaxDelayMs: number;
  /** Max allowed gap between short turns to aggregate as siblings (ms) */
  aggregationMaxGapMs: number;
  /** Max words allowed before aggregated turn flushes (0 disables word limit) */
  aggregationMaxWords?: number;
  /** Max total duration allowed for aggregated turn before flush (ms, 0 disables) */
  aggregationMaxTotalDurationMs?: number;
}

export const defaultShortTurnAggregationConfig: ShortTurnAggregationConfig = {
  minTurnDurationMs: 1200,
  aggregationMaxDelayMs: 800,
  aggregationMaxGapMs: 400,
  aggregationMaxWords: 50,
  aggregationMaxTotalDurationMs: 12e3,
};
