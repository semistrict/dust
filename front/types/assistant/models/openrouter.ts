import type { ModelConfigurationType } from "./types";

// OpenRouter model IDs use the format "provider/model-name".

// OpenAI
export const OPENROUTER_OPENAI_GPT_5_4_MODEL_ID =
  "openai/gpt-5.4" as const;
export const OPENROUTER_OPENAI_GPT_5_4_MINI_MODEL_ID =
  "openai/gpt-5.4-mini" as const;
export const OPENROUTER_OPENAI_GPT_5_4_NANO_MODEL_ID =
  "openai/gpt-5.4-nano" as const;

// Anthropic
export const OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4_6_MODEL_ID =
  "anthropic/claude-sonnet-4.6" as const;
export const OPENROUTER_ANTHROPIC_CLAUDE_OPUS_4_6_MODEL_ID =
  "anthropic/claude-opus-4.6" as const;

// Google
export const OPENROUTER_GOOGLE_GEMINI_3_1_PRO_MODEL_ID =
  "google/gemini-3.1-pro-preview" as const;
export const OPENROUTER_GOOGLE_GEMINI_3_FLASH_MODEL_ID =
  "google/gemini-3-flash-preview" as const;

// DeepSeek
export const OPENROUTER_DEEPSEEK_V3_2_MODEL_ID =
  "deepseek/deepseek-v3.2" as const;

// Xiaomi
export const OPENROUTER_XIAOMI_MIMO_V2_PRO_MODEL_ID =
  "xiaomi/mimo-v2-pro" as const;

// --- Model Configs ---

export const OPENROUTER_OPENAI_GPT_5_4_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openrouter",
  modelId: OPENROUTER_OPENAI_GPT_5_4_MODEL_ID,
  displayName: "GPT-5.4 (OpenRouter)",
  contextSize: 1_050_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "OpenAI's GPT-5.4 via OpenRouter (1M context).",
  shortDescription: "GPT-5.4 via OpenRouter.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 16_384,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};

export const OPENROUTER_OPENAI_GPT_5_4_MINI_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_OPENAI_GPT_5_4_MINI_MODEL_ID,
    displayName: "GPT-5.4 Mini (OpenRouter)",
    contextSize: 400_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: false,
    description: "OpenAI's GPT-5.4 Mini via OpenRouter (400k context).",
    shortDescription: "GPT-5.4 Mini via OpenRouter.",
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 16_384,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "tiktoken", base: "o200k_base" },
  };

export const OPENROUTER_OPENAI_GPT_5_4_NANO_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_OPENAI_GPT_5_4_NANO_MODEL_ID,
    displayName: "GPT-5.4 Nano (OpenRouter)",
    contextSize: 400_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: false,
    description: "OpenAI's GPT-5.4 Nano via OpenRouter (400k context).",
    shortDescription: "GPT-5.4 Nano via OpenRouter.",
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 16_384,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "tiktoken", base: "o200k_base" },
  };

export const OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4_6_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4_6_MODEL_ID,
    displayName: "Claude Sonnet 4.6 (OpenRouter)",
    contextSize: 1_000_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    description:
      "Anthropic's Claude Sonnet 4.6 via OpenRouter (1M context).",
    shortDescription: "Claude Sonnet 4.6 via OpenRouter.",
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 16_384,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "claude" },
  };

export const OPENROUTER_ANTHROPIC_CLAUDE_OPUS_4_6_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_ANTHROPIC_CLAUDE_OPUS_4_6_MODEL_ID,
    displayName: "Claude Opus 4.6 (OpenRouter)",
    contextSize: 1_000_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    description:
      "Anthropic's Claude Opus 4.6 via OpenRouter (1M context).",
    shortDescription: "Claude Opus 4.6 via OpenRouter.",
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 16_384,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "claude" },
  };

export const OPENROUTER_GOOGLE_GEMINI_3_1_PRO_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_GOOGLE_GEMINI_3_1_PRO_MODEL_ID,
    displayName: "Gemini 3.1 Pro (OpenRouter)",
    contextSize: 1_048_576,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    description:
      "Google's Gemini 3.1 Pro via OpenRouter (1M context).",
    shortDescription: "Gemini 3.1 Pro via OpenRouter.",
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 16_384,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "tiktoken", base: "o200k_base" },
  };

export const OPENROUTER_GOOGLE_GEMINI_3_FLASH_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_GOOGLE_GEMINI_3_FLASH_MODEL_ID,
    displayName: "Gemini 3 Flash (OpenRouter)",
    contextSize: 1_048_576,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: false,
    description:
      "Google's Gemini 3 Flash via OpenRouter (1M context).",
    shortDescription: "Gemini 3 Flash via OpenRouter.",
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 16_384,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "tiktoken", base: "o200k_base" },
  };

export const OPENROUTER_DEEPSEEK_V3_2_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openrouter",
  modelId: OPENROUTER_DEEPSEEK_V3_2_MODEL_ID,
  displayName: "DeepSeek V3.2 (OpenRouter)",
  contextSize: 163_840,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek V3.2 via OpenRouter (164k context).",
  shortDescription: "DeepSeek V3.2 via OpenRouter.",
  isLegacy: false,
  isLatest: true,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};

export const OPENROUTER_XIAOMI_MIMO_V2_PRO_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_XIAOMI_MIMO_V2_PRO_MODEL_ID,
    displayName: "MiMo V2 Pro (OpenRouter)",
    contextSize: 1_048_576,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    description:
      "Xiaomi's MiMo V2 Pro via OpenRouter (1M context).",
    shortDescription: "MiMo V2 Pro via OpenRouter.",
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 16_384,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "tiktoken", base: "o200k_base" },
  };
