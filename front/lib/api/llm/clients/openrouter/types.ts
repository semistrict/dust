import type { LLMParameters } from "@app/lib/api/llm/types/options";
import {
  OPENROUTER_ANTHROPIC_CLAUDE_HAIKU_4_5_MODEL_ID,
  OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4_MODEL_ID,
  OPENROUTER_DEEPSEEK_CHAT_MODEL_ID,
  OPENROUTER_GOOGLE_GEMINI_2_5_FLASH_MODEL_ID,
  OPENROUTER_META_LLAMA_4_MAVERICK_MODEL_ID,
  OPENROUTER_OPENAI_GPT_4O_MINI_MODEL_ID,
  OPENROUTER_OPENAI_GPT_4O_MODEL_ID,
} from "@app/types/assistant/models/openrouter";
import type { ModelIdType } from "@app/types/assistant/models/types";

export const OPENROUTER_PROVIDER_ID = "openrouter";

export const OPENROUTER_WHITELISTED_MODEL_IDS = [
  OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4_MODEL_ID,
  OPENROUTER_ANTHROPIC_CLAUDE_HAIKU_4_5_MODEL_ID,
  OPENROUTER_OPENAI_GPT_4O_MODEL_ID,
  OPENROUTER_OPENAI_GPT_4O_MINI_MODEL_ID,
  OPENROUTER_GOOGLE_GEMINI_2_5_FLASH_MODEL_ID,
  OPENROUTER_META_LLAMA_4_MAVERICK_MODEL_ID,
  OPENROUTER_DEEPSEEK_CHAT_MODEL_ID,
] as const;

export type OpenRouterWhitelistedModelId =
  (typeof OPENROUTER_WHITELISTED_MODEL_IDS)[number];

export function isOpenRouterWhitelistedModelId(
  modelId: ModelIdType
): modelId is OpenRouterWhitelistedModelId {
  return (OPENROUTER_WHITELISTED_MODEL_IDS as readonly string[]).includes(
    modelId
  );
}

export function overwriteLLMParameters(
  llmParameters: LLMParameters & {
    modelId: OpenRouterWhitelistedModelId;
  }
): LLMParameters & { modelId: OpenRouterWhitelistedModelId } {
  // OpenRouter passes through to the underlying provider, no overwrites needed.
  return llmParameters;
}
