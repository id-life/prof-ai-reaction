import z from "zod/v4";

export const TextBufferConfigSchema = z.object({
  bufferSize: z
    .number()
    .min(0)
    .describe("Buffer size in characters"),
  windowDuration: z
    .number()
    .min(0)
    .describe("Window duration in seconds"),
  segmentMaxSize: z
    .number()
    .min(0)
    .describe("Maximum segment size in characters"),
  retentionTime: z
    .number()
    .min(0)
    .describe("Retention time in seconds"),
});

export const BufferStatsSchema = z.object({
  totalCharacters: z.number(),
  segmentCount: z.number(),
  oldestTimestamp: z.number(),
  newestTimestamp: z.number(),
  averageSegmentSize: z.number(),
});

export const defaultTextBufferConfig: TextBufferConfig = {
  bufferSize: 100000,
  windowDuration: 30,
  segmentMaxSize: 100,
  retentionTime: 300,
};

export type TextBufferConfig = z.output<typeof TextBufferConfigSchema>;
export type BufferStats = z.output<typeof BufferStatsSchema>;
