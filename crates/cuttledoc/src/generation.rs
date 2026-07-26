use std::path::PathBuf;
use std::time::Duration;

use crate::{BackendId, CancellationToken, CuttledocError, ErrorCode, ModelId, Result};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GenerationRole {
    System,
    User,
    Assistant,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GenerationMessage {
    pub role: GenerationRole,
    pub content: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GenerationOutputFormat {
    Text,
    JsonObject,
    JsonSchema {
        name: String,
        schema: String,
        strict: bool,
    },
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct GenerationOptions {
    pub max_output_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<u32>,
    pub seed: Option<u64>,
    pub stop: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct GenerationRequest {
    pub messages: Vec<GenerationMessage>,
    pub output_format: GenerationOutputFormat,
    pub options: GenerationOptions,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FinishReason {
    Stop,
    Length,
    Cancelled,
    Other,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct GenerationUsage {
    pub prompt_tokens: Option<u64>,
    pub generated_tokens: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GenerationUpdate {
    pub sequence: u64,
    pub text_delta: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct GenerationResult {
    pub text: String,
    pub finish_reason: FinishReason,
    pub usage: GenerationUsage,
}

pub trait TextGenerationEngine {
    fn backend(&self) -> BackendId;

    fn model(&self) -> ModelId;

    fn generate(
        &mut self,
        request: &GenerationRequest,
        cancellation: &CancellationToken,
        on_update: &mut dyn FnMut(GenerationUpdate) -> Result<()>,
    ) -> Result<GenerationResult>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GemmaGenerationOptions {
    pub model_directory: PathBuf,
    pub metallib_path: Option<PathBuf>,
}

pub struct GemmaGenerationEngine {
    inner: cuttledoc_gemma_mlx::GemmaEngine,
    backend: BackendId,
    model: ModelId,
}

impl GemmaGenerationEngine {
    pub fn create(options: &GemmaGenerationOptions) -> Result<Self> {
        let inner = cuttledoc_gemma_mlx::GemmaEngine::create(&cuttledoc_gemma_mlx::EngineOptions {
            model_directory: options.model_directory.clone(),
            metallib_path: options.metallib_path.clone(),
            memory: None,
        })
        .map_err(CuttledocError::from)?;
        Ok(Self {
            inner,
            backend: BackendId::gemma_mlx(),
            model: ModelId::new(cuttledoc_gemma_mlx::MODEL_ID)
                .expect("the built-in Gemma model ID is valid"),
        })
    }
}

impl TextGenerationEngine for GemmaGenerationEngine {
    fn backend(&self) -> BackendId {
        self.backend.clone()
    }

    fn model(&self) -> ModelId {
        self.model.clone()
    }

    fn generate(
        &mut self,
        request: &GenerationRequest,
        cancellation: &CancellationToken,
        on_update: &mut dyn FnMut(GenerationUpdate) -> Result<()>,
    ) -> Result<GenerationResult> {
        validate_gemma_request(request, &self.backend, &self.model)?;
        if cancellation.is_cancelled() {
            return Err(gemma_error(
                ErrorCode::Cancelled,
                "Gemma generation was cancelled",
                &self.backend,
                &self.model,
            ));
        }

        let messages = request
            .messages
            .iter()
            .map(|message| cuttledoc_gemma_mlx::ChatMessage {
                role: match message.role {
                    GenerationRole::System => cuttledoc_gemma_mlx::ChatRole::System,
                    GenerationRole::User => cuttledoc_gemma_mlx::ChatRole::User,
                    GenerationRole::Assistant => cuttledoc_gemma_mlx::ChatRole::Assistant,
                },
                content: message.content.clone(),
            })
            .collect::<Vec<_>>();
        let maximum_tokens = request.options.max_output_tokens.unwrap_or(4_096);
        let mut sequence = 0_u64;
        let mut callback_error = None;
        let native = self.inner.generate(
            &messages,
            maximum_tokens,
            || cancellation.is_cancelled(),
            |text_delta| {
                match on_update(GenerationUpdate {
                    sequence,
                    text_delta,
                }) {
                    Ok(()) => sequence = sequence.saturating_add(1),
                    Err(error) => {
                        callback_error = Some(error);
                        return Err(cuttledoc_gemma_mlx::AdapterError::callback_violation(
                            "the product generation callback rejected an update",
                        ));
                    }
                }
                Ok(())
            },
        );
        if let Some(error) = callback_error {
            return Err(error);
        }
        let native = native.map_err(CuttledocError::from)?;
        Ok(GenerationResult {
            text: native.text,
            finish_reason: match native.finish_reason {
                cuttledoc_gemma_mlx::NativeFinishReason::Stop => FinishReason::Stop,
                cuttledoc_gemma_mlx::NativeFinishReason::Length => FinishReason::Length,
            },
            usage: GenerationUsage {
                prompt_tokens: Some(native.prompt_tokens),
                generated_tokens: Some(native.generated_tokens),
            },
        })
    }
}

pub struct OpenRouterGenerationOptions {
    credential: cuttledoc_openrouter::Credential,
    timeout: Duration,
}

impl OpenRouterGenerationOptions {
    pub fn from_api_key(api_key: String) -> Result<Self> {
        Ok(Self {
            credential: cuttledoc_openrouter::Credential::new(api_key)
                .map_err(CuttledocError::from)?,
            timeout: cuttledoc_openrouter::DEFAULT_TIMEOUT,
        })
    }

    pub fn from_environment() -> Result<Self> {
        Ok(Self {
            credential: cuttledoc_openrouter::Credential::from_environment()
                .map_err(CuttledocError::from)?,
            timeout: cuttledoc_openrouter::DEFAULT_TIMEOUT,
        })
    }

    pub const fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }
}

pub struct OpenRouterGenerationEngine {
    inner: cuttledoc_openrouter::OpenRouterEngine,
    backend: BackendId,
    model: ModelId,
}

impl OpenRouterGenerationEngine {
    pub fn create(options: OpenRouterGenerationOptions) -> Result<Self> {
        let inner =
            cuttledoc_openrouter::OpenRouterEngine::create(cuttledoc_openrouter::EngineOptions {
                credential: options.credential,
                timeout: options.timeout,
            })
            .map_err(CuttledocError::from)?;
        Ok(Self {
            inner,
            backend: BackendId::openrouter(),
            model: ModelId::new(cuttledoc_openrouter::MODEL_ID)
                .expect("the built-in OpenRouter model ID is valid"),
        })
    }
}

impl TextGenerationEngine for OpenRouterGenerationEngine {
    fn backend(&self) -> BackendId {
        self.backend.clone()
    }

    fn model(&self) -> ModelId {
        self.model.clone()
    }

    fn generate(
        &mut self,
        request: &GenerationRequest,
        cancellation: &CancellationToken,
        on_update: &mut dyn FnMut(GenerationUpdate) -> Result<()>,
    ) -> Result<GenerationResult> {
        let request = openrouter_request(request, &self.backend, &self.model)?;
        if cancellation.is_cancelled() {
            return Err(openrouter_error(
                ErrorCode::Cancelled,
                "OpenRouter generation was cancelled",
                &self.backend,
                &self.model,
            ));
        }
        let result = self
            .inner
            .generate(&request, || cancellation.is_cancelled())
            .map_err(CuttledocError::from)?;
        if cancellation.is_cancelled() {
            return Err(openrouter_error(
                ErrorCode::Cancelled,
                "OpenRouter generation was cancelled",
                &self.backend,
                &self.model,
            ));
        }
        on_update(GenerationUpdate {
            sequence: 0,
            text_delta: result.text.clone(),
        })?;
        Ok(GenerationResult {
            text: result.text,
            finish_reason: match result.finish_reason {
                cuttledoc_openrouter::FinishReason::Stop => FinishReason::Stop,
                cuttledoc_openrouter::FinishReason::Length => FinishReason::Length,
                cuttledoc_openrouter::FinishReason::Other => FinishReason::Other,
            },
            usage: GenerationUsage {
                prompt_tokens: result.prompt_tokens,
                generated_tokens: result.generated_tokens,
            },
        })
    }
}

fn openrouter_request(
    request: &GenerationRequest,
    backend: &BackendId,
    model: &ModelId,
) -> Result<cuttledoc_openrouter::GenerationRequest> {
    let options = &request.options;
    if request.messages.is_empty()
        || options.max_output_tokens == Some(0)
        || options.temperature.is_some_and(|value| value != 0.0)
        || options.top_p.is_some()
        || options.top_k.is_some()
        || options.seed.is_some_and(|value| value != 0)
        || !options.stop.is_empty()
    {
        return Err(openrouter_error(
            ErrorCode::InvalidInput,
            "Gemini through OpenRouter supports non-empty chats with the pinned decoding options and seed zero",
            backend,
            model,
        ));
    }
    Ok(cuttledoc_openrouter::GenerationRequest {
        messages: request
            .messages
            .iter()
            .map(|message| cuttledoc_openrouter::Message {
                role: match message.role {
                    GenerationRole::System => cuttledoc_openrouter::Role::System,
                    GenerationRole::User => cuttledoc_openrouter::Role::User,
                    GenerationRole::Assistant => cuttledoc_openrouter::Role::Assistant,
                },
                content: message.content.clone(),
            })
            .collect(),
        output_format: match &request.output_format {
            GenerationOutputFormat::Text => cuttledoc_openrouter::OutputFormat::Text,
            GenerationOutputFormat::JsonObject => cuttledoc_openrouter::OutputFormat::JsonObject,
            GenerationOutputFormat::JsonSchema {
                name,
                schema,
                strict,
            } => cuttledoc_openrouter::OutputFormat::JsonSchema {
                name: name.clone(),
                schema: schema.clone(),
                strict: *strict,
            },
        },
        maximum_tokens: options.max_output_tokens.unwrap_or(4_096),
        temperature: options.temperature,
        seed: options.seed,
    })
}

fn openrouter_error(
    code: ErrorCode,
    message: impl Into<String>,
    backend: &BackendId,
    model: &ModelId,
) -> CuttledocError {
    CuttledocError::new(code, message)
        .with_backend(backend.clone())
        .with_model(model.clone())
}

fn validate_gemma_request(
    request: &GenerationRequest,
    backend: &BackendId,
    model: &ModelId,
) -> Result<()> {
    let options = &request.options;
    if request.messages.is_empty()
        || options.max_output_tokens == Some(0)
        || options.temperature.is_some_and(|value| value != 0.0)
        || options.top_p.is_some()
        || options.top_k.is_some()
        || options.seed.is_some_and(|value| value != 0)
        || !options.stop.is_empty()
    {
        return Err(gemma_error(
            ErrorCode::InvalidInput,
            "Gemma MLX supports non-empty chats with greedy decoding, seed zero, and built-in stop tokens",
            backend,
            model,
        ));
    }
    Ok(())
}

fn gemma_error(
    code: ErrorCode,
    message: impl Into<String>,
    backend: &BackendId,
    model: &ModelId,
) -> CuttledocError {
    CuttledocError::new(code, message)
        .with_backend(backend.clone())
        .with_model(model.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generation_defaults_never_invent_sampler_behavior() {
        let options = GenerationOptions::default();
        assert_eq!(options.max_output_tokens, None);
        assert_eq!(options.temperature, None);
        assert_eq!(options.seed, None);
        assert!(options.stop.is_empty());
    }

    #[test]
    fn gemma_rejects_sampler_behavior_outside_the_pinned_contract() {
        let backend = BackendId::gemma_mlx();
        let model =
            ModelId::new(cuttledoc_gemma_mlx::MODEL_ID).expect("the built-in model ID is valid");
        let request = GenerationRequest {
            messages: vec![GenerationMessage {
                role: GenerationRole::User,
                content: "Correct this.".to_owned(),
            }],
            output_format: GenerationOutputFormat::Text,
            options: GenerationOptions {
                temperature: Some(0.5),
                ..GenerationOptions::default()
            },
        };
        assert_eq!(
            validate_gemma_request(&request, &backend, &model)
                .expect_err("sampling must be rejected")
                .code,
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn openrouter_mapping_preserves_structured_output_and_pinned_decoding() {
        let backend = BackendId::openrouter();
        let model =
            ModelId::new(cuttledoc_openrouter::MODEL_ID).expect("the built-in model ID is valid");
        let request = GenerationRequest {
            messages: vec![GenerationMessage {
                role: GenerationRole::User,
                content: "Correct this.".to_owned(),
            }],
            output_format: GenerationOutputFormat::JsonSchema {
                name: "correction".to_owned(),
                schema: r#"{"type":"object"}"#.to_owned(),
                strict: true,
            },
            options: GenerationOptions {
                max_output_tokens: Some(256),
                temperature: Some(0.0),
                seed: Some(0),
                ..GenerationOptions::default()
            },
        };
        let mapped =
            openrouter_request(&request, &backend, &model).expect("request must be supported");
        assert_eq!(mapped.maximum_tokens, 256);
        assert_eq!(mapped.temperature, Some(0.0));
        assert_eq!(mapped.seed, Some(0));
        assert!(matches!(
            mapped.output_format,
            cuttledoc_openrouter::OutputFormat::JsonSchema { strict: true, .. }
        ));
    }

    #[test]
    fn openrouter_rejects_unpinned_sampler_options() {
        let backend = BackendId::openrouter();
        let model =
            ModelId::new(cuttledoc_openrouter::MODEL_ID).expect("the built-in model ID is valid");
        let request = GenerationRequest {
            messages: vec![GenerationMessage {
                role: GenerationRole::User,
                content: "Correct this.".to_owned(),
            }],
            output_format: GenerationOutputFormat::Text,
            options: GenerationOptions {
                top_p: Some(0.9),
                ..GenerationOptions::default()
            },
        };
        assert_eq!(
            openrouter_request(&request, &backend, &model)
                .expect_err("sampling must be rejected")
                .code,
            ErrorCode::InvalidInput
        );
    }
}
