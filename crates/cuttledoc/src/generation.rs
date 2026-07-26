use crate::{BackendId, CancellationToken, ModelId, Result};

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
}
