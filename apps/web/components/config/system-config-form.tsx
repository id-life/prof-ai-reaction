"use client";

import { useAtom } from "jotai";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  commentGeneratorConfigAtom,
  contextBufferConfigAtom,
  decisionEngineConfigAtom,
  eventDetectorConfigAtom,
  shortTurnAggregatorConfigAtom,
  uncommentedBufferConfigAtom,
} from "./atom";
import { CommentGeneratorConfigForm } from "./comment-generator-config-form";
import { DecisionEngineConfigForm } from "./decision-engine-config-form";
import { EventDetectorConfigForm } from "./event-detector-config-form";
import { ShortTurnAggregatorConfigForm } from "./short-turn-aggregator-config-form";
import { TextBufferConfigForm } from "./text-buffer-config-form";

function CommentGeneratorSection() {
  const [config, setConfig] = useAtom(commentGeneratorConfigAtom);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Comment Generation</h3>
        <p className="text-sm text-muted-foreground">
          Configure writers and comment selection settings.
        </p>
      </div>
      <CommentGeneratorConfigForm defaultValues={config} onSubmit={setConfig} />
    </div>
  );
}

function DecisionEngineSection() {
  const [config, setConfig] = useAtom(decisionEngineConfigAtom);
  console.log("DecisionEngineSection default config", config);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Decision Engine</h3>
        <p className="text-sm text-muted-foreground">
          Configure decision-making parameters and thresholds.
        </p>
      </div>
      <DecisionEngineConfigForm defaultValues={config} onSubmit={setConfig} />
    </div>
  );
}

function EventDetectionSection() {
  const [config, setConfig] = useAtom(eventDetectorConfigAtom);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Event Detection</h3>
        <p className="text-sm text-muted-foreground">
          Configure event detection patterns and sensitivity.
        </p>
      </div>
      <EventDetectorConfigForm defaultValues={config} onSubmit={setConfig} />
    </div>
  );
}

function TextBuffersSection() {
  const [contextBufferConfig, setContextBufferConfig] = useAtom(
    contextBufferConfigAtom,
  );
  const [uncommentedBufferConfig, setUncommentedBufferConfig] = useAtom(
    uncommentedBufferConfigAtom,
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Text Buffers</h3>
        <p className="text-sm text-muted-foreground">
          Configure context and uncommented text buffer settings.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-base font-medium">Context Buffer</h4>
          <p className="text-sm text-muted-foreground">
            Buffer for storing contextual information.
          </p>
        </div>
        <TextBufferConfigForm
          defaultValues={contextBufferConfig}
          onSubmit={setContextBufferConfig}
        />
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-base font-medium">Uncommented Buffer</h4>
          <p className="text-sm text-muted-foreground">
            Buffer for storing uncommented text data.
          </p>
        </div>
        <TextBufferConfigForm
          defaultValues={uncommentedBufferConfig}
          onSubmit={setUncommentedBufferConfig}
        />
      </div>
    </div>
  );
}

function TurnAggregationSection() {
  const [config, setConfig] = useAtom(shortTurnAggregatorConfigAtom);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Turn Aggregation</h3>
        <p className="text-sm text-muted-foreground">
          Configure short turn aggregation behavior.
        </p>
      </div>
      <ShortTurnAggregatorConfigForm
        defaultValues={config}
        onSubmit={setConfig}
      />
    </div>
  );
}

export function SystemConfigForm() {
  return (
    <Tabs defaultValue="comment-generation" className="w-full">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="comment-generation">Comments</TabsTrigger>
        <TabsTrigger value="decision-engine">Decisions</TabsTrigger>
        <TabsTrigger value="event-detection">Events</TabsTrigger>
        <TabsTrigger value="text-buffers">Buffers</TabsTrigger>
        <TabsTrigger value="turn-aggregation">Turns</TabsTrigger>
      </TabsList>

      <TabsContent value="comment-generation">
        <CommentGeneratorSection />
      </TabsContent>

      <TabsContent value="decision-engine">
        <DecisionEngineSection />
      </TabsContent>

      <TabsContent value="event-detection">
        <EventDetectionSection />
      </TabsContent>

      <TabsContent value="text-buffers">
        <TextBuffersSection />
      </TabsContent>

      <TabsContent value="turn-aggregation">
        <TurnAggregationSection />
      </TabsContent>
    </Tabs>
  );
}
