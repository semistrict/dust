import type { LLMParameters } from "@app/lib/api/llm/types/options";
import {
  OPENROUTER_ANTHROPIC_CLAUDE_OPUS_4_6_MODEL_ID,
  OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4_6_MODEL_ID,
  OPENROUTER_DEEPSEEK_V3_2_MODEL_ID,
  OPENROUTER_GOOGLE_GEMINI_3_1_PRO_MODEL_ID,
  OPENROUTER_GOOGLE_GEMINI_3_FLASH_MODEL_ID,
  OPENROUTER_OPENAI_GPT_5_4_MINI_MODEL_ID,
  OPENROUTER_OPENAI_GPT_5_4_MODEL_ID,
  OPENROUTER_OPENAI_GPT_5_4_NANO_MODEL_ID,
  OPENROUTER_XIAOMI_MIMO_V2_PRO_MODEL_ID,
} from "@app/types/assistant/models/openrouter";
import type { ModelIdType } from "@app/types/assistant/models/types";

export const OPENROUTER_PROVIDER_ID = "openrouter";

export const OPENROUTER_WHITELISTED_MODEL_IDS = [
  OPENROUTER_OPENAI_GPT_5_4_MODEL_ID,
  OPENROUTER_OPENAI_GPT_5_4_MINI_MODEL_ID,
  OPENROUTER_OPENAI_GPT_5_4_NANO_MODEL_ID,
  OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4_6_MODEL_ID,
  OPENROUTER_ANTHROPIC_CLAUDE_OPUS_4_6_MODEL_ID,
  OPENROUTER_GOOGLE_GEMINI_3_1_PRO_MODEL_ID,
  OPENROUTER_GOOGLE_GEMINI_3_FLASH_MODEL_ID,
  OPENROUTER_DEEPSEEK_V3_2_MODEL_ID,
  OPENROUTER_XIAOMI_MIMO_V2_PRO_MODEL_ID,
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
  return llmParameters;
}
