"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type DecisionEngineConfig,
  DecisionEngineConfigSchema,
} from "@prof/ai-reaction";
import { useForm } from "react-hook-form";
import type z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useAutoSubmit } from "./use-auto-submit";

interface DecisionEngineConfigFormProps {
  defaultValues: DecisionEngineConfig;
  onSubmit: (data: DecisionEngineConfig) => void | Promise<void>;
}

export function DecisionEngineConfigForm({
  defaultValues,
  onSubmit,
}: DecisionEngineConfigFormProps) {
  const form = useForm<z.infer<typeof DecisionEngineConfigSchema>>({
    resolver: zodResolver(DecisionEngineConfigSchema),
    defaultValues,
    mode: "onChange",
  });

  useAutoSubmit(form, onSubmit);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="baseThreshold"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Base Threshold: {field.value}</FormLabel>
              <FormControl>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={[field.value ?? 0]}
                  onValueChange={(value) => field.onChange(value[0])}
                />
              </FormControl>
              <FormDescription>
                Base threshold for decision engine (0-1).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="minInterval"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min Interval (seconds)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxInterval"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Interval (seconds)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Weight sliders */}
        {(
          [
            { name: "emotionWeight", label: "Emotion Weight" },
            { name: "topicWeight", label: "Topic Weight" },
            { name: "timingWeight", label: "Timing Weight" },
            { name: "importanceWeight", label: "Importance Weight" },
            { name: "keywordWeight", label: "Keyword Weight" },
            { name: "frequencySuppression", label: "Frequency Suppression" },
            { name: "timeDecayRate", label: "Time Decay Rate" },
          ] as const
        ).map((weight) => (
          <FormField
            key={weight.name}
            control={form.control}
            name={weight.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {weight.label}: {field.value ?? 0}
                </FormLabel>
                <FormControl>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[field.value ?? 0]}
                    onValueChange={(value) => field.onChange(value[0])}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
      </form>
    </Form>
  );
}
