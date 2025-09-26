import z from "zod";

export const ShortTurnAggregatorConfigSchema = z.object({
  minTurnDurationMs: z
    .number()
    .min(0)
    .describe("Minimal duration required to consider a turn ready (ms)"),
  aggregationMaxDelayMs: z
    .number()
    .min(0)
    .describe("Max time to wait to aggregate short turns before clearing (ms)"),
  aggregationMaxGapMs: z
    .number()
    .min(0)
    .describe("Max allowed gap between short turns to aggregate as siblings (ms)"),
  aggregationMaxWords: z
    .number()
    .min(0)
    .optional()
    .describe("Max words allowed before aggregated turn flushes (0 disables word limit)"),
  aggregationMaxTotalDurationMs: z
    .number()
    .min(0)
    .optional()
    .describe("Max total duration allowed for aggregated turn before flush (ms, 0 disables)"),
});

export const defaultShortTurnAggregatorConfig: ShortTurnAggregatorConfig = {
  minTurnDurationMs: 1200,
  aggregationMaxDelayMs: 800,
  aggregationMaxGapMs: 400,
  aggregationMaxWords: 50,
  aggregationMaxTotalDurationMs: 12e3,
};

export type ShortTurnAggregatorConfig = z.output<typeof ShortTurnAggregatorConfigSchema>;
