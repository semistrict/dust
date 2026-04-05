import type { ModelConfigurationType } from "./types";

// OpenRouter model IDs use the format "provider/model-name".
export const OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4_MODEL_ID =
  "anthropic/claude-sonnet-4" as const;
export const OPENROUTER_ANTHROPIC_CLAUDE_HAIKU_4_5_MODEL_ID =
  "anthropic/claude-haiku-4-5" as const;
export const OPENROUTER_OPENAI_GPT_4O_MODEL_ID = "openai/gpt-4o" as const;
export const OPENROUTER_OPENAI_GPT_4O_MINI_MODEL_ID =
  "openai/gpt-4o-mini" as const;
export const OPENROUTER_GOOGLE_GEMINI_2_5_FLASH_MODEL_ID =
  "google/gemini-2.5-flash" as const;
export const OPENROUTER_META_LLAMA_4_MAVERICK_MODEL_ID =
  "meta-llama/llama-4-maverick" as const;
export const OPENROUTER_DEEPSEEK_CHAT_MODEL_ID =
  "deepseek/deepseek-chat-v3-0324" as const;

export const OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_ANTHROPIC_CLAUDE_SONNET_4_MODEL_ID,
    displayName: "Claude Sonnet 4 (OpenRouter)",
    contextSize: 200_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    description: "Anthropic's Claude Sonnet 4 via OpenRouter (200k context).",
    shortDescription: "Claude Sonnet 4 via OpenRouter.",
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 8_192,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "claude" },
  };

export const OPENROUTER_ANTHROPIC_CLAUDE_HAIKU_4_5_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_ANTHROPIC_CLAUDE_HAIKU_4_5_MODEL_ID,
    displayName: "Claude Haiku 4.5 (OpenRouter)",
    contextSize: 200_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: false,
    description: "Anthropic's Claude Haiku 4.5 via OpenRouter (200k context).",
    shortDescription: "Claude Haiku 4.5 via OpenRouter.",
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 8_192,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "claude" },
  };

export const OPENROUTER_OPENAI_GPT_4O_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openrouter",
  modelId: OPENROUTER_OPENAI_GPT_4O_MODEL_ID,
  displayName: "GPT-4o (OpenRouter)",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "OpenAI's GPT-4o via OpenRouter (128k context).",
  shortDescription: "GPT-4o via OpenRouter.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 4_096,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};

export const OPENROUTER_OPENAI_GPT_4O_MINI_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_OPENAI_GPT_4O_MINI_MODEL_ID,
    displayName: "GPT-4o Mini (OpenRouter)",
    contextSize: 128_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: false,
    description: "OpenAI's GPT-4o Mini via OpenRouter (128k context).",
    shortDescription: "GPT-4o Mini via OpenRouter.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 4_096,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "tiktoken", base: "o200k_base" },
  };

export const OPENROUTER_GOOGLE_GEMINI_2_5_FLASH_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_GOOGLE_GEMINI_2_5_FLASH_MODEL_ID,
    displayName: "Gemini 2.5 Flash (OpenRouter)",
    contextSize: 1_000_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: false,
    description: "Google's Gemini 2.5 Flash via OpenRouter (1M context).",
    shortDescription: "Gemini 2.5 Flash via OpenRouter.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 8_192,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: true,
    tokenizer: { type: "tiktoken", base: "o200k_base" },
  };

export const OPENROUTER_META_LLAMA_4_MAVERICK_MODEL_CONFIG: ModelConfigurationType =
  {
    providerId: "openrouter",
    modelId: OPENROUTER_META_LLAMA_4_MAVERICK_MODEL_ID,
    displayName: "Llama 4 Maverick (OpenRouter)",
    contextSize: 1_000_000,
    recommendedTopK: 32,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    description: "Meta's Llama 4 Maverick via OpenRouter (1M context).",
    shortDescription: "Llama 4 Maverick via OpenRouter.",
    isLegacy: false,
    isLatest: false,
    generationTokensCount: 8_192,
    supportsVision: true,
    minimumReasoningEffort: "none",
    maximumReasoningEffort: "none",
    defaultReasoningEffort: "none",
    supportsResponseFormat: false,
    tokenizer: { type: "tiktoken", base: "o200k_base" },
  };

export const OPENROUTER_DEEPSEEK_CHAT_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openrouter",
  modelId: OPENROUTER_DEEPSEEK_CHAT_MODEL_ID,
  displayName: "DeepSeek V3 (OpenRouter)",
  contextSize: 131_072,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "DeepSeek V3 via OpenRouter (131k context).",
  shortDescription: "DeepSeek V3 via OpenRouter.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 8_192,
  supportsVision: false,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: true,
  tokenizer: { type: "tiktoken", base: "o200k_base" },
};
