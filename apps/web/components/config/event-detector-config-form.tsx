"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type EventDetectorConfig,
  EventDetectorConfigSchema,
} from "@prof/ai-reaction";
import { useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useAutoSubmit } from "./use-auto-submit";

interface EventDetectorConfigFormProps {
  defaultValues: EventDetectorConfig;
  onSubmit: (data: EventDetectorConfig) => void | Promise<void>;
}

export function EventDetectorConfigForm({
  defaultValues,
  onSubmit,
}: EventDetectorConfigFormProps) {
  const form = useForm<EventDetectorConfig>({
    resolver: zodResolver(EventDetectorConfigSchema),
    defaultValues,
    mode: "onChange",
  });

  useAutoSubmit(form, onSubmit);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="modelProvider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model Provider</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="model"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model</FormLabel>
              <FormControl>
                <Input {...field} placeholder="gpt-5-nano" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {(
          [
            {
              name: "detectionSensitivity",
              label: "Detection Sensitivity",
              description: "Minimum confidence threshold for event detection",
            },
            {
              name: "emotionThreshold",
              label: "Emotion Threshold",
              description: "Minimum intensity threshold for emotional events",
            },
            {
              name: "topicTransitionThreshold",
              label: "Topic Transition Threshold",
              description:
                "Minimum intensity threshold for topic transition events",
            },
            {
              name: "keypointDensityThreshold",
              label: "Keypoint Density Threshold",
              description: "Minimum density threshold for keypoint events",
            },
          ] as const
        ).map((threshold) => (
          <FormField
            key={threshold.name}
            control={form.control}
            name={threshold.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {threshold.label}: {field.value}
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
                <FormDescription>{threshold.description}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
      </form>
    </Form>
  );
}
