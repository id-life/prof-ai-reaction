export * as writers from "./agents/writer.js";
export {
  type CommentAgentConfig,
  type CommentGeneratorConfig,
  defaultCommentGeneratorConfig,
} from "./def.js";
export { type GenerationContext, generateComment } from "./service.js";
