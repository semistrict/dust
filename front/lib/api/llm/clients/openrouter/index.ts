import type { OpenRouterWhitelistedModelId } from "@app/lib/api/llm/clients/openrouter/types";
import {
  OPENROUTER_PROVIDER_ID,
  overwriteLLMParameters,
} from "@app/lib/api/llm/clients/openrouter/types";
import { LLM } from "@app/lib/api/llm/llm";
import { handleGenericError } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import {
  toMessages,
  toOutputFormatParam,
  toToolChoiceParam,
  toTools,
} from "@app/lib/api/llm/utils/openai_like/chat/conversation_to_openai";
import { streamLLMEvents } from "@app/lib/api/llm/utils/openai_like/chat/openai_to_events";
import { handleError } from "@app/lib/api/llm/utils/openai_like/errors";
import type { Authenticator } from "@app/lib/auth";
import assert from "assert";
import { APIError, OpenAI } from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";

export class OpenRouterLLM extends LLM<ChatCompletionCreateParamsStreaming> {
  private client: OpenAI;

  constructor(
    auth: Authenticator,
    llmParameters: LLMParameters & {
      modelId: OpenRouterWhitelistedModelId;
    }
  ) {
    const params = overwriteLLMParameters(llmParameters);
    super(auth, OPENROUTER_PROVIDER_ID, params);

    const { OPENROUTER_API_KEY } = llmParameters.credentials;
    assert(OPENROUTER_API_KEY, "OPENROUTER_API_KEY credential is required");
    this.client = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }

  protected buildStreamRequestPayload({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): ChatCompletionCreateParamsStreaming {
    const tools =
      specifications.length > 0 ? toTools(specifications) : undefined;

    return {
      model: this.modelId,
      messages: toMessages(systemPromptToText(prompt), conversation),
      stream: true,
      temperature: this.temperature ?? undefined,
      tool_choice: toToolChoiceParam(specifications, forceToolCall),
      ...(tools ? { tools } : {}),
      response_format: toOutputFormatParam(this.responseFormat),
    };
  }

  protected async *sendRequest(
    payload: ChatCompletionCreateParamsStreaming
  ): AsyncGenerator<LLMEvent> {
    try {
      const events = await this.client.chat.completions.create(payload);
      yield* streamLLMEvents(events, this.metadata);
    } catch (err) {
      if (err instanceof APIError) {
        yield handleError(err, this.metadata);
      } else {
        yield handleGenericError(err, this.metadata);
      }
    }
  }
}
