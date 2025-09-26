"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type CommentGeneratorConfig,
  CommentGeneratorConfigSchema,
} from "@prof/ai-reaction";
import { Plus, Trash2 } from "lucide-react";
import {
  FieldValues,
  UseFormReturn,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { useAutoSubmit } from "./use-auto-submit";

interface CommentGeneratorConfigFormProps {
  defaultValues: CommentGeneratorConfig;
  onSubmit: (data: CommentGeneratorConfig) => void | Promise<void>;
}

export function CommentGeneratorConfigForm({
  defaultValues,
  onSubmit,
}: CommentGeneratorConfigFormProps) {
  const form = useForm<CommentGeneratorConfig>({
    resolver: zodResolver(CommentGeneratorConfigSchema),
    defaultValues,
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "writers",
  });

  useAutoSubmit(form, onSubmit);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="border-t pt-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium">Comment Selection</h3>
              <p className="text-sm text-muted-foreground">
                Configure how the best comment is selected from writers.
              </p>
            </div>

            <FormField
              control={form.control}
              name="selectorModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Selector Model</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ""}
                      placeholder="gpt-5-mini"
                    />
                  </FormControl>
                  <FormDescription>
                    The model used for selecting the best comment from writers.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="selectorInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Selector Instructions</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ""}
                      placeholder="Instructions for selecting the best comment..."
                      className="min-h-[80px]"
                    />
                  </FormControl>
                  <FormDescription>
                    Custom instructions for the comment selection process.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">Comment Writers</h3>
              <p className="text-sm text-muted-foreground">
                Configure writers that generate different types of comments.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  name: "",
                  instructions: "",
                  minLength: 10,
                  maxLength: 100,
                })
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Writer
            </Button>
          </div>

          <div className="space-y-3">
            {fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No writers configured yet.</p>
                <p className="text-sm">Add a writer to get started.</p>
              </div>
            ) : (
              fields.map((field, index) => (
                <Card key={field.id} className="p-4">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-medium text-base">
                      Writer {index + 1}
                    </h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name={`writers.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter writer name" />
                          </FormControl>
                          <FormDescription>
                            A descriptive name for this comment writer.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`writers.${index}.instructions`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instructions</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Enter instructions for this writer"
                              className="min-h-[80px]"
                            />
                          </FormControl>
                          <FormDescription>
                            Instructions that guide how this writer generates
                            comments.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`writers.${index}.minLength`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Min Length</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                min={0}
                                onChange={(e) =>
                                  field.onChange(Number(e.target.value))
                                }
                              />
                            </FormControl>
                            <FormDescription>
                              Minimum comment length.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`writers.${index}.maxLength`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Length</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                min={0}
                                onChange={(e) =>
                                  field.onChange(Number(e.target.value))
                                }
                              />
                            </FormControl>
                            <FormDescription>
                              Maximum comment length.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name={`writers.${index}.model`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ""}
                              placeholder="gpt-4"
                            />
                          </FormControl>
                          <FormDescription>
                            Specific model to use for this writer. Leave empty
                            to use default.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

      </form>
    </Form>
  );
}
