"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ShortTurnAggregatorConfig,
  ShortTurnAggregatorConfigSchema,
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
import { useAutoSubmit } from "./use-auto-submit";

interface ShortTurnAggregatorConfigFormProps {
  defaultValues: ShortTurnAggregatorConfig;
  onSubmit: (data: ShortTurnAggregatorConfig) => void | Promise<void>;
}

export function ShortTurnAggregatorConfigForm({
  defaultValues,
  onSubmit,
}: ShortTurnAggregatorConfigFormProps) {
  const form = useForm<ShortTurnAggregatorConfig>({
    resolver: zodResolver(ShortTurnAggregatorConfigSchema),
    defaultValues,
    mode: "onChange",
  });

  useAutoSubmit(form, onSubmit);

  const fields = [
    {
      name: "minTurnDurationMs",
      label: "Min Turn Duration (ms)",
      description: "Minimal duration required to consider a turn ready (ms)",
    },
    {
      name: "aggregationMaxDelayMs",
      label: "Aggregation Max Delay (ms)",
      description:
        "Max time to wait to aggregate short turns before clearing (ms)",
    },
    {
      name: "aggregationMaxGapMs",
      label: "Aggregation Max Gap (ms)",
      description:
        "Max allowed gap between short turns to aggregate as siblings (ms)",
    },
    {
      name: "aggregationMaxWords",
      label: "Aggregation Max Words",
      description:
        "Max words allowed before aggregated turn flushes (0 disables word limit)",
    },
    {
      name: "aggregationMaxTotalDurationMs",
      label: "Aggregation Max Total Duration (ms)",
      description:
        "Max total duration allowed for aggregated turn before flush (ms, 0 disables)",
    },
  ] as const;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {fields.map((field) => (
          <FormField
            key={field.name}
            control={form.control}
            name={field.name}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{field.label}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...formField}
                    onChange={(e) => formField.onChange(e.target.valueAsNumber)}
                  />
                </FormControl>
                <FormDescription>{field.description}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

      </form>
    </Form>
  );
}
