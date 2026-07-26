use std::path::PathBuf;

use crate::enhancement::fallback_from_engine_error;
use crate::{
    BackendId, CancellationToken, CuttledocError, EnhancementSection, ErrorCode,
    GemmaGenerationEngine, GemmaGenerationOptions, ModelId, OpenRouterGenerationEngine,
    OpenRouterGenerationOptions, Result, TextGenerationEngine, TranscriptEnhancementRequest,
    TranscriptionResult, enhance_transcript,
};

pub struct TranscriptEnhancementMode(TranscriptEnhancementModeKind);

enum TranscriptEnhancementModeKind {
    Disabled,
    GemmaMlx {
        model_directory: Option<PathBuf>,
        metallib_path: Option<PathBuf>,
    },
    GeminiOpenRouter {
        credential: HostedCredential,
    },
}

enum HostedCredential {
    Environment,
    InMemory(String),
}

impl TranscriptEnhancementMode {
    pub const fn disabled() -> Self {
        Self(TranscriptEnhancementModeKind::Disabled)
    }

    pub fn gemma_mlx(model_directory: Option<PathBuf>, metallib_path: Option<PathBuf>) -> Self {
        Self(TranscriptEnhancementModeKind::GemmaMlx {
            model_directory,
            metallib_path,
        })
    }

    pub const fn gemini_openrouter_from_environment() -> Self {
        Self(TranscriptEnhancementModeKind::GeminiOpenRouter {
            credential: HostedCredential::Environment,
        })
    }

    pub fn gemini_openrouter(api_key: String) -> Self {
        Self(TranscriptEnhancementModeKind::GeminiOpenRouter {
            credential: HostedCredential::InMemory(api_key),
        })
    }
}

impl Default for TranscriptEnhancementMode {
    fn default() -> Self {
        Self::disabled()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TranscriptEnhancementContext {
    pub language: String,
    pub locale: String,
    pub domain: String,
    pub error_profile: String,
    pub glossary: Vec<String>,
    pub protected_spans: Vec<String>,
}

impl TranscriptEnhancementContext {
    pub fn new(language: impl Into<String>, locale: impl Into<String>) -> Self {
        Self {
            language: language.into(),
            locale: locale.into(),
            domain: "professional-audio".to_owned(),
            error_profile: "unspecified".to_owned(),
            glossary: Vec::new(),
            protected_spans: Vec::new(),
        }
    }
}

pub fn apply_transcript_enhancement(
    mut transcription: TranscriptionResult,
    mode: TranscriptEnhancementMode,
    context: &TranscriptEnhancementContext,
    cancellation: &CancellationToken,
) -> Result<TranscriptionResult> {
    if matches!(&mode.0, TranscriptEnhancementModeKind::Disabled) {
        return Ok(transcription);
    }
    if transcription.enhancement.is_some() {
        return Err(CuttledocError::new(
            ErrorCode::InvalidInput,
            "a transcription may only be enhanced once",
        ));
    }
    if transcription.raw_text.trim().is_empty() {
        return Ok(transcription);
    }
    if cancellation.is_cancelled() {
        return Err(CuttledocError::new(
            ErrorCode::Cancelled,
            "transcript enhancement was cancelled",
        ));
    }

    let request = TranscriptEnhancementRequest {
        language: context.language.clone(),
        locale: context.locale.clone(),
        domain: context.domain.clone(),
        asr_backend: transcription.backend.clone(),
        error_profile: context.error_profile.clone(),
        glossary: context.glossary.clone(),
        sections: vec![EnhancementSection {
            id: "transcript".to_owned(),
            text: transcription.raw_text.clone(),
            protected_spans: context.protected_spans.clone(),
        }],
    };
    let (backend, model, engine) = create_engine(mode);
    let mut enhancement = match engine {
        Ok(mut engine) => enhance_transcript(&request, engine.as_mut(), cancellation)?,
        Err(error) if error.code == ErrorCode::Cancelled || cancellation.is_cancelled() => {
            return Err(error);
        }
        Err(error) => fallback_from_engine_error(&request, backend, model, &error)?,
    };
    enhancement.raw_text = transcription.raw_text.clone();
    if matches!(
        &enhancement.outcome,
        crate::EnhancementOutcome::RawFallback { .. }
    ) {
        enhancement.text = transcription.raw_text.clone();
    }
    transcription.text = enhancement.text.clone();
    transcription.enhancement = Some(enhancement);
    Ok(transcription)
}

fn create_engine(
    mode: TranscriptEnhancementMode,
) -> (BackendId, ModelId, Result<Box<dyn TextGenerationEngine>>) {
    match mode.0 {
        TranscriptEnhancementModeKind::Disabled => unreachable!("disabled mode returns early"),
        TranscriptEnhancementModeKind::GemmaMlx {
            model_directory,
            metallib_path,
        } => {
            let backend = BackendId::gemma_mlx();
            let model = ModelId::new(cuttledoc_gemma_mlx::MODEL_ID)
                .expect("the built-in Gemma model ID is valid");
            let Some(model_directory) =
                model_directory.or_else(cuttledoc_gemma_mlx::configured_model_directory)
            else {
                let error = CuttledocError::new(
                    ErrorCode::ModelMissing,
                    "Gemma 4 26B-A4B 4-bit is not installed",
                )
                .with_backend(backend.clone())
                .with_model(model.clone());
                return (backend, model, Err(error));
            };
            let engine = GemmaGenerationEngine::create(&GemmaGenerationOptions {
                model_directory,
                metallib_path,
            })
            .map(|engine| Box::new(engine) as Box<dyn TextGenerationEngine>);
            (backend, model, engine)
        }
        TranscriptEnhancementModeKind::GeminiOpenRouter { credential } => {
            let backend = BackendId::openrouter();
            let model = ModelId::new(cuttledoc_openrouter::MODEL_ID)
                .expect("the built-in OpenRouter model ID is valid");
            let options = match credential {
                HostedCredential::Environment => OpenRouterGenerationOptions::from_environment(),
                HostedCredential::InMemory(api_key) => {
                    OpenRouterGenerationOptions::from_api_key(api_key)
                }
            };
            let engine = options
                .and_then(OpenRouterGenerationEngine::create)
                .map(|engine| Box::new(engine) as Box<dyn TextGenerationEngine>);
            (backend, model, engine)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    fn transcription() -> TranscriptionResult {
        TranscriptionResult {
            raw_text: "das ist roh".to_owned(),
            text: "das ist roh".to_owned(),
            language: Some("de-DE".to_owned()),
            backend: BackendId::whisper(),
            model: None,
            media_duration: Duration::from_secs(1),
            processing_duration: Duration::from_millis(100),
            segments: Vec::new(),
            enhancement: None,
        }
    }

    #[test]
    fn disabled_enhancement_preserves_the_raw_result() {
        let result = apply_transcript_enhancement(
            transcription(),
            TranscriptEnhancementMode::disabled(),
            &TranscriptEnhancementContext::new("German", "de-DE"),
            &CancellationToken::new(),
        )
        .expect("disabled enhancement must succeed");
        assert_eq!(result.text, result.raw_text);
        assert!(result.enhancement.is_none());
    }

    #[test]
    fn setup_failure_retains_raw_text_and_stable_metadata() {
        let secret = " secret-that-must-not-appear ";
        let result = apply_transcript_enhancement(
            transcription(),
            TranscriptEnhancementMode::gemini_openrouter(secret.to_owned()),
            &TranscriptEnhancementContext::new("German", "de-DE"),
            &CancellationToken::new(),
        )
        .expect("enhancement setup failure must fall back");
        assert_eq!(result.text, result.raw_text);
        let enhancement = result.enhancement.expect("fallback metadata");
        assert_eq!(enhancement.backend, BackendId::openrouter());
        assert!(!format!("{:?}", enhancement.outcome).contains(secret));
    }

    #[test]
    fn cancellation_prevents_runtime_acquisition() {
        let cancellation = CancellationToken::new();
        cancellation.cancel();
        let error = apply_transcript_enhancement(
            transcription(),
            TranscriptEnhancementMode::gemini_openrouter("unused".to_owned()),
            &TranscriptEnhancementContext::new("German", "de-DE"),
            &cancellation,
        )
        .expect_err("pre-cancelled enhancement must fail");
        assert_eq!(error.code, ErrorCode::Cancelled);
    }
}
