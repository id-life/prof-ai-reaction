import type { CommentGeneratorConfig } from "./comment-gen/index.js";
import type { DecisionEngineConfig } from "./decision-engine/index.js";
import type { EventDetectorConfig } from "./event-detector/index.js";
import {
  defaultTextBufferConfig,
  type TextBufferConfig,
} from "./text-buffer/index.js";
import type { ShortTurnAggregatorConfig } from "./turn-agg/def.js";

export type Config = {
  commentGenerator: CommentGeneratorConfig;
  decisionEngine: DecisionEngineConfig;
  eventDetector: EventDetectorConfig;
  contextBuffer: TextBufferConfig;
  uncommentedBuffer: TextBufferConfig;
  shortTurnAggregator: ShortTurnAggregatorConfig;
  apiKeys: ApiKeys;
};

export type ConfigInput = Partial<{
  commentGenerator: Partial<CommentGeneratorConfig>;
  decisionEngine: Partial<DecisionEngineConfig>;
  eventDetector: Partial<EventDetectorConfig>;
  contextBuffer: Partial<TextBufferConfig>;
  uncommentedBuffer: Partial<TextBufferConfig>;
  shortTurnAggregator: Partial<ShortTurnAggregatorConfig>;
}>;

export type ApiKeys = {
  openai?: string;
  google?: string;
};

export const defaultContextBufferConfig: TextBufferConfig = {
  ...defaultTextBufferConfig,
  retentionTime: 3600, // 1 hour retention for full context
  windowDuration: 300, // 5 minute window for context
};
export const defaultUncommentedBufferConfig: TextBufferConfig = {
  ...defaultContextBufferConfig,
};

export { defaultCommentGeneratorConfig } from "./comment-gen/index.js";
export { defaultDecisionEngineConfig } from "./decision-engine/index.js";
export { defaultEventDetectorConfig } from "./event-detector/index.js";
export { defaultShortTurnAggregatorConfig } from "./turn-agg/index.js";
