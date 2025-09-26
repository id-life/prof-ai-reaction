import {
  type ApiKeys,
  type CommentGeneratorConfig,
  type CommentSystemConfig,
  type DecisionEngineConfig,
  defaultCommentGeneratorConfig,
  defaultContextBufferConfig,
  defaultDecisionEngineConfig,
  defaultEventDetectorConfig,
  defaultShortTurnAggregatorConfig,
  defaultUncommentedBufferConfig,
  type EventDetectorConfig,
  type ShortTurnAggregatorConfig,
  type TextBufferConfig,
  writers,
} from "@prof/ai-reaction";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const apiKeysAtom = atomWithStorage<ApiKeys>("apiKeys", {});
export const commentGeneratorConfigAtom =
  atomWithStorage<CommentGeneratorConfig>(
    "commentGeneratorConfig",
    {
      ...defaultCommentGeneratorConfig,
      writers: [
        writers.analytical,
        writers.emotional,
        writers.descriptive,
        writers.humorous,
        writers.predictive,
        writers.summary,
      ],
    },
    undefined,
    { getOnInit: true },
  );

export const decisionEngineConfigAtom = atomWithStorage<DecisionEngineConfig>(
  "decisionEngineConfig",
  defaultDecisionEngineConfig,
  undefined,
  { getOnInit: true },
);

export const eventDetectorConfigAtom = atomWithStorage<EventDetectorConfig>(
  "eventDetectorConfig",
  defaultEventDetectorConfig,
  undefined,
  { getOnInit: true },
);

export const uncommentedBufferConfigAtom = atomWithStorage<TextBufferConfig>(
  "uncommentedBufferConfig",
  defaultUncommentedBufferConfig,
  undefined,
  { getOnInit: true },
);

export const contextBufferConfigAtom = atomWithStorage<TextBufferConfig>(
  "contextBufferConfig",
  defaultContextBufferConfig,
  undefined,
  { getOnInit: true },
);

export const shortTurnAggregatorConfigAtom =
  atomWithStorage<ShortTurnAggregatorConfig>(
    "shortTurnAggregatorConfig",
    defaultShortTurnAggregatorConfig,
    undefined,
    { getOnInit: true },
  );

export const systemConfigAtom = atom<CommentSystemConfig>((get) => ({
  apiKeys: get(apiKeysAtom),
  commentGenerator: get(commentGeneratorConfigAtom),
  decisionEngine: get(decisionEngineConfigAtom),
  eventDetector: get(eventDetectorConfigAtom),
  contextBuffer: get(contextBufferConfigAtom),
  uncommentedBuffer: get(uncommentedBufferConfigAtom),
  shortTurnAggregator: get(shortTurnAggregatorConfigAtom),
}));
