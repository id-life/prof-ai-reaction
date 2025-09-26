"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ApiKeys } from "@prof/ai-reaction";
import { useAtom } from "jotai";
import { Key } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { apiKeysAtom } from "./atom";
import { useAutoSubmit } from "./use-auto-submit";

const apiKeysSchema = z.object({
  openai: z
    .string()
    .refine(
      (key) => key.startsWith("sk-") || key.startsWith("sk-proj-"),
      "OpenAI API key should start with 'sk-' or 'sk-proj-'",
    )
    .optional(),
  google: z.string().optional(),
});

export function ApiKeysForm() {
  const [apiKeys, setApiKeys] = useAtom(apiKeysAtom);
  const form = useForm<ApiKeys>({
    resolver: zodResolver(apiKeysSchema),
    defaultValues: apiKeys,
    mode: "onChange",
  });

  useAutoSubmit(form, setApiKeys);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(setApiKeys)} className="space-y-6">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                OpenAI API Key
              </CardTitle>
              <CardDescription>
                Required for AI comment generation and event detection. Get your
                API key from{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  OpenAI Platform
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="openai"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input type="text" placeholder="sk-..." {...field} />
                      </FormControl>
                    </div>
                    <FormDescription>
                      Your OpenAI API key will be stored securely and used for
                      AI operations.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Google API Key
              </CardTitle>
              <CardDescription>
                Required for Google Gemini services.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="google"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Enter Google API key..."
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormDescription>
                      Your Google API key will be stored securely and used for
                      Google AI services.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </div>

      </form>
    </Form>
  );
}
