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
