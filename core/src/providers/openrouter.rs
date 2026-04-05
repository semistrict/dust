use crate::providers::chat_messages::ChatMessage;
use crate::providers::embedder::Embedder;
use crate::providers::llm::ChatFunction;
use crate::providers::llm::TokenizerSingleton;
use crate::providers::llm::{LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::provider::{Provider, ProviderID};
use crate::run::Credentials;
use crate::types::tokenizer::{TiktokenTokenizerBase, TokenizerConfig};
use crate::utils;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::Uri;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

use super::openai_compatible_helpers::{
    openai_compatible_chat_completion, TransformSystemMessages,
};

pub struct OpenRouterLLM {
    id: String,
    tokenizer: Option<TokenizerSingleton>,
    api_key: Option<String>,
}

impl OpenRouterLLM {
    pub fn new(id: String, tokenizer: Option<TokenizerSingleton>) -> Self {
        OpenRouterLLM {
            id,
            tokenizer: tokenizer.or_else(|| {
                TokenizerSingleton::from_config(&TokenizerConfig::Tiktoken {
                    base: TiktokenTokenizerBase::O200kBase,
                })
            }),
            api_key: None,
        }
    }

    fn chat_uri(&self) -> Result<Uri> {
        Ok("https://openrouter.ai/api/v1/chat/completions".parse::<Uri>()?)
    }

    pub fn openrouter_context_size(_model_id: &str) -> usize {
        // OpenRouter models vary; use a conservative default.
        // The front-end model configs specify the actual per-model context size.
        131072
    }
}

#[async_trait]
impl LLM for OpenRouterLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("OPENROUTER_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => {
                match tokio::task::spawn_blocking(|| std::env::var("OPENROUTER_API_KEY")).await? {
                    Ok(key) => {
                        self.api_key = Some(key);
                    }
                    Err(_) => Err(anyhow!(
                        "Credentials or environment variable `OPENROUTER_API_KEY` is not set."
                    ))?,
                }
            }
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        Self::openrouter_context_size(self.id.as_str())
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        self.tokenizer
            .as_ref()
            .ok_or_else(|| anyhow!("Tokenizer not initialized"))?
            .encode(text)
            .await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        self.tokenizer
            .as_ref()
            .ok_or_else(|| anyhow!("Tokenizer not initialized"))?
            .decode(tokens)
            .await
    }

    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>> {
        self.tokenizer
            .as_ref()
            .ok_or_else(|| anyhow!("Tokenizer not initialized"))?
            .tokenize(texts)
            .await
    }

    async fn generate(
        &self,
        _prompt: &str,
        mut _max_tokens: Option<i32>,
        _temperature: f32,
        _n: usize,
        _stop: &Vec<String>,
        _frequency_penalty: Option<f32>,
        _presence_penalty: Option<f32>,
        _top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        Err(anyhow!(
            "OpenRouter models do not support text completions, only chat completions."
        ))
    }

    async fn chat(
        &self,
        messages: &Vec<ChatMessage>,
        functions: &Vec<ChatFunction>,
        function_call: Option<String>,
        temperature: f32,
        top_p: Option<f32>,
        n: usize,
        stop: &Vec<String>,
        max_tokens: Option<i32>,
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        logprobs: Option<bool>,
        top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        let api_key = match self.api_key.clone() {
            Some(key) => key,
            None => Err(anyhow!("OPENROUTER_API_KEY is not set."))?,
        };

        openai_compatible_chat_completion(
            self.chat_uri()?,
            self.id.clone(),
            api_key,
            messages,
            functions,
            function_call,
            temperature,
            top_p,
            n,
            stop,
            max_tokens,
            presence_penalty,
            frequency_penalty,
            logprobs,
            top_logprobs,
            None,
            event_sender,
            false,                         // OpenRouter supports streaming
            TransformSystemMessages::Keep, // OpenRouter supports system messages
            "OpenRouter".to_string(),
            false, // OpenRouter supports structured message content
        )
        .await
    }
}

pub struct OpenRouterProvider {}

impl OpenRouterProvider {
    pub fn new() -> Self {
        OpenRouterProvider {}
    }
}

#[async_trait]
impl Provider for OpenRouterProvider {
    fn id(&self) -> ProviderID {
        ProviderID::OpenRouter
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up OpenRouter:");
        utils::info("");
        utils::info(
            "To use OpenRouter, you must set the environment variable `OPENROUTER_API_KEY`.",
        );
        utils::info("Your API key can be found at https://openrouter.ai/keys");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test openrouter`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `openai/gpt-4o-mini` on the OpenRouter API.",
        )? {
            Err(anyhow!("User aborted OpenRouter test."))?;
        }

        let tokenizer = TokenizerSingleton::from_config(&TokenizerConfig::Tiktoken {
            base: TiktokenTokenizerBase::O200kBase,
        });
        let mut llm = self.llm(String::from("openai/gpt-4o-mini"), tokenizer);
        llm.initialize(Credentials::new()).await?;

        let messages = vec![
            ChatMessage::System(super::chat_messages::SystemChatMessage {
                role: super::llm::ChatMessageRole::System,
                content: "You are a helpful assistant.".to_string(),
            }),
            ChatMessage::User(super::chat_messages::UserChatMessage {
                role: super::llm::ChatMessageRole::User,
                content: super::chat_messages::ContentBlock::Text(
                    "Hello! Reply with a single word.".to_string(),
                ),
                name: None,
            }),
        ];

        let _ = llm
            .chat(
                &messages,
                &vec![],
                None,
                0.7,
                None,
                1,
                &vec![],
                Some(1),
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .await?;

        utils::done("Test successfully completed! OpenRouter is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String, tokenizer: Option<TokenizerSingleton>) -> Box<dyn LLM + Sync + Send> {
        Box::new(OpenRouterLLM::new(id, tokenizer))
    }

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!("OpenRouter does not support embeddings")
    }
}
