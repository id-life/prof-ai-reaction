"use client";

import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import {
  commentGeneratorConfigAtom,
  contextBufferConfigAtom,
  decisionEngineConfigAtom,
  eventDetectorConfigAtom,
  shortTurnAggregatorConfigAtom,
  uncommentedBufferConfigAtom,
} from "./atom";

export function ExportConfigButton() {
  const [commentGeneratorConfig] = useAtom(commentGeneratorConfigAtom);
  const [decisionEngineConfig] = useAtom(decisionEngineConfigAtom);
  const [eventDetectorConfig] = useAtom(eventDetectorConfigAtom);
  const [contextBufferConfig] = useAtom(contextBufferConfigAtom);
  const [uncommentedBufferConfig] = useAtom(uncommentedBufferConfigAtom);
  const [shortTurnAggregatorConfig] = useAtom(shortTurnAggregatorConfigAtom);

  const exportToJson = () => {
    const config = {
      commentGenerator: commentGeneratorConfig,
      decisionEngine: decisionEngineConfig,
      eventDetector: eventDetectorConfig,
      contextBuffer: contextBufferConfig,
      uncommentedBuffer: uncommentedBufferConfig,
      shortTurnAggregator: shortTurnAggregatorConfig,
    };

    const dataStr = JSON.stringify(config, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;

    const exportFileDefaultName = "system-config.json";

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  };

  return (
    <Button onClick={exportToJson} variant="outline">
      Export to JSON
    </Button>
  );
}
