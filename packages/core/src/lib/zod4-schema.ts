import type { JsonSchemaDefinition } from "@openai/agents";
import type {
  AutoParseableResponseFormat,
  AutoParseableTextFormat,
} from "openai/lib/parser";
import {
  makeParseableResponseFormat,
  makeParseableTextFormat,
} from "openai/lib/parser";
import type { ResponseFormatJSONSchema } from "openai/resources";
import type { ResponseFormatTextJSONSchemaConfig } from "openai/resources/responses/responses";
import { z } from "zod/v4";

export function zodResponseFormat<ZodInput extends z.ZodType>(
  zodObject: ZodInput,
  name: string,
  props?: Omit<
    ResponseFormatJSONSchema.JSONSchema,
    "schema" | "strict" | "name"
  >,
): AutoParseableResponseFormat<z.infer<ZodInput>> {
  return makeParseableResponseFormat(
    {
      type: "json_schema",
      json_schema: {
        ...props,
        name,
        strict: true,
        schema: z.toJSONSchema(zodObject, { target: "openapi-3.0" }),
      },
    },
    (content) => zodObject.parse(JSON.parse(content)),
  );
}

export function zodTextFormat<ZodInput extends z.ZodType>(
  zodObject: ZodInput,
  name: string,
  props?: Omit<
    ResponseFormatTextJSONSchemaConfig,
    "schema" | "type" | "strict" | "name"
  >,
): AutoParseableTextFormat<z.infer<ZodInput>> {
  return makeParseableTextFormat(
    {
      type: "json_schema",
      ...props,
      name,
      strict: true,
      schema: z.toJSONSchema(zodObject, { target: "openapi-3.0" }),
    },
    (content) => zodObject.parse(JSON.parse(content)),
  );
}

export function zodAgentFormat<ZodInput extends z.ZodType>(
  zodObject: ZodInput,
  name: string,
): ZodInput {
  const schema = {
    type: "json_schema",
    name,
    strict: true,
    schema: z.toJSONSchema(zodObject, {
      target: "openapi-3.0",
    }),
  } as JsonSchemaDefinition;
  return schema as unknown as ZodInput;
}

export function zodGeminiFormat<ZodInput extends z.ZodType>(
  zodObject: ZodInput,
): {
  responseSchema: z.core.JSONSchema.JSONSchema;
  parse: (content: string) => z.infer<ZodInput>;
} {
  // Convert Zod schema to JSON Schema using Zod 4's native conversion
  const jsonSchema = z.toJSONSchema(zodObject, { target: "openapi-3.0" });

  return {
    responseSchema: jsonSchema,
    parse: (content: string) => zodObject.parse(JSON.parse(content)),
  };
}

// https://github.com/openai/openai-node/issues/1576#issuecomment-3056734414
