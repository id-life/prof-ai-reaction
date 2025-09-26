import z from "zod/v4";

export const TextBufferConfigSchema = z.object({
  bufferSize: z.number().min(0).describe("Buffer size in words"),
  windowDuration: z.number().min(0).describe("Window duration in seconds"),
  segmentMaxSize: z.number().min(0).describe("Maximum segment size in words"),
  retentionTime: z.number().min(0).describe("Retention time in seconds"),
});

export const BufferStatsSchema = z.object({
  totalCharacters: z.number(),
  totalWords: z.number(),
  segmentCount: z.number(),
  oldestTimestamp: z.number(),
  newestTimestamp: z.number(),
  averageSegmentSize: z.number(),
});

export const defaultTextBufferConfig: TextBufferConfig = {
  bufferSize: 10000,
  windowDuration: 30,
  segmentMaxSize: 50,
  retentionTime: 300,
};

export type TextBufferConfig = z.output<typeof TextBufferConfigSchema>;
export type BufferStats = z.output<typeof BufferStatsSchema>;
