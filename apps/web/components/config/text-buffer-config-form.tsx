"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type TextBufferConfig,
  TextBufferConfigSchema,
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

interface TextBufferConfigFormProps {
  defaultValues: TextBufferConfig;
  onSubmit: (data: TextBufferConfig) => void | Promise<void>;
}

export function TextBufferConfigForm({
  defaultValues,
  onSubmit,
}: TextBufferConfigFormProps) {
  const form = useForm<TextBufferConfig>({
    resolver: zodResolver(TextBufferConfigSchema),
    defaultValues,
    mode: "onChange",
  });

  useAutoSubmit(form, onSubmit);

  const fields = [
    {
      name: "bufferSize",
      label: "Buffer Size (words)",
      description: "Maximum buffer size in words",
    },
    {
      name: "windowDuration",
      label: "Window Duration (seconds)",
      description: "Duration of each window in seconds",
    },
    {
      name: "segmentMaxSize",
      label: "Segment Max Size (words)",
      description: "Maximum size for each segment in words",
    },
    {
      name: "retentionTime",
      label: "Retention Time (seconds)",
      description: "How long to retain data in seconds",
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
