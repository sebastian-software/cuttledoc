use std::error::Error;
use std::fmt;

use crate::{BackendId, ContractError, ModelId};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorCode {
    InvalidInput,
    UnsupportedPlatform,
    BackendUnavailable,
    ModelMissing,
    ModelInvalid,
    ModelDownloadFailed,
    AudioDecodeFailed,
    EngineBusy,
    EngineClosed,
    EngineLoadFailed,
    BackendContractViolation,
    TranscriptionFailed,
    GenerationFailed,
    GenerationContractViolation,
    AuthenticationFailed,
    Cancelled,
}

impl ErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidInput => "INVALID_INPUT",
            Self::UnsupportedPlatform => "UNSUPPORTED_PLATFORM",
            Self::BackendUnavailable => "BACKEND_UNAVAILABLE",
            Self::ModelMissing => "MODEL_MISSING",
            Self::ModelInvalid => "MODEL_INVALID",
            Self::ModelDownloadFailed => "MODEL_DOWNLOAD_FAILED",
            Self::AudioDecodeFailed => "AUDIO_DECODE_FAILED",
            Self::EngineBusy => "ENGINE_BUSY",
            Self::EngineClosed => "ENGINE_CLOSED",
            Self::EngineLoadFailed => "ENGINE_LOAD_FAILED",
            Self::BackendContractViolation => "BACKEND_CONTRACT_VIOLATION",
            Self::TranscriptionFailed => "TRANSCRIPTION_FAILED",
            Self::GenerationFailed => "GENERATION_FAILED",
            Self::GenerationContractViolation => "GENERATION_CONTRACT_VIOLATION",
            Self::AuthenticationFailed => "AUTHENTICATION_FAILED",
            Self::Cancelled => "CANCELLED",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CuttledocError {
    pub code: ErrorCode,
    pub message: String,
    pub backend: Option<BackendId>,
    pub model: Option<ModelId>,
}

impl CuttledocError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            backend: None,
            model: None,
        }
    }

    pub fn with_backend(mut self, backend: BackendId) -> Self {
        self.backend = Some(backend);
        self
    }

    pub fn with_model(mut self, model: ModelId) -> Self {
        self.model = Some(model);
        self
    }
}

impl fmt::Display for CuttledocError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code.as_str(), self.message)
    }
}

impl Error for CuttledocError {}

impl From<ContractError> for CuttledocError {
    fn from(error: ContractError) -> Self {
        Self::new(
            ErrorCode::BackendContractViolation,
            format!(
                "transcription update violated the contract: {}",
                error.code()
            ),
        )
    }
}

impl From<cuttledoc_apple_speech::AdapterError> for CuttledocError {
    fn from(error: cuttledoc_apple_speech::AdapterError) -> Self {
        use cuttledoc_apple_speech::AdapterErrorKind;

        let code = match error.kind {
            AdapterErrorKind::UnsupportedPlatform => ErrorCode::UnsupportedPlatform,
            AdapterErrorKind::InvalidInput => ErrorCode::InvalidInput,
            AdapterErrorKind::InventoryFailed => ErrorCode::BackendUnavailable,
            AdapterErrorKind::SessionCreateFailed => ErrorCode::EngineLoadFailed,
            AdapterErrorKind::NativeFailure => ErrorCode::TranscriptionFailed,
            AdapterErrorKind::SessionClosed => ErrorCode::EngineClosed,
            AdapterErrorKind::CallbackViolation => ErrorCode::BackendContractViolation,
        };
        Self::new(code, error.message).with_backend(BackendId::apple_speech())
    }
}

impl From<cuttledoc_audio::AudioDecodeError> for CuttledocError {
    fn from(error: cuttledoc_audio::AudioDecodeError) -> Self {
        use cuttledoc_audio::AudioDecodeErrorKind;

        let code = match error.kind {
            AudioDecodeErrorKind::InvalidInput => ErrorCode::InvalidInput,
            AudioDecodeErrorKind::Cancelled => ErrorCode::Cancelled,
            AudioDecodeErrorKind::ExecutableUnavailable
            | AudioDecodeErrorKind::ProcessFailed
            | AudioDecodeErrorKind::InvalidOutput => ErrorCode::AudioDecodeFailed,
        };
        Self::new(code, error.message)
    }
}

impl From<cuttledoc_whisper::AdapterError> for CuttledocError {
    fn from(error: cuttledoc_whisper::AdapterError) -> Self {
        use cuttledoc_whisper::AdapterErrorKind;

        let code = match error.kind {
            AdapterErrorKind::UnsupportedPlatform => ErrorCode::UnsupportedPlatform,
            AdapterErrorKind::SourceNotPrepared => ErrorCode::BackendUnavailable,
            AdapterErrorKind::InvalidInput => ErrorCode::InvalidInput,
            AdapterErrorKind::ModelMissing => ErrorCode::ModelMissing,
            AdapterErrorKind::ModelInvalid => ErrorCode::ModelInvalid,
            AdapterErrorKind::EngineLoadFailed => ErrorCode::EngineLoadFailed,
            AdapterErrorKind::TranscriptionFailed => ErrorCode::TranscriptionFailed,
            AdapterErrorKind::Cancelled => ErrorCode::Cancelled,
            AdapterErrorKind::CallbackViolation => ErrorCode::BackendContractViolation,
        };
        Self::new(code, error.message)
            .with_backend(BackendId::whisper())
            .with_model(
                ModelId::new(cuttledoc_whisper::MODEL_ID)
                    .expect("the built-in Whisper model ID is valid"),
            )
    }
}

impl From<cuttledoc_openai_transcription::AdapterError> for CuttledocError {
    fn from(error: cuttledoc_openai_transcription::AdapterError) -> Self {
        use cuttledoc_openai_transcription::AdapterErrorKind;

        let code = match error.kind {
            AdapterErrorKind::CredentialsMissing | AdapterErrorKind::AuthenticationFailed => {
                ErrorCode::AuthenticationFailed
            }
            AdapterErrorKind::InvalidInput => ErrorCode::InvalidInput,
            AdapterErrorKind::ResponseInvalid => ErrorCode::BackendContractViolation,
            AdapterErrorKind::Cancelled => ErrorCode::Cancelled,
            AdapterErrorKind::RateLimited
            | AdapterErrorKind::TimedOut
            | AdapterErrorKind::TransportFailed => ErrorCode::TranscriptionFailed,
        };
        Self::new(code, error.message).with_backend(BackendId::openai_transcription())
    }
}

impl From<cuttledoc_gemma_mlx::AdapterError> for CuttledocError {
    fn from(error: cuttledoc_gemma_mlx::AdapterError) -> Self {
        use cuttledoc_gemma_mlx::AdapterErrorKind;

        let code = match error.kind {
            AdapterErrorKind::UnsupportedPlatform => ErrorCode::UnsupportedPlatform,
            AdapterErrorKind::SourceNotPrepared => ErrorCode::BackendUnavailable,
            AdapterErrorKind::InvalidInput => ErrorCode::InvalidInput,
            AdapterErrorKind::ModelMissing => ErrorCode::ModelMissing,
            AdapterErrorKind::ModelInvalid => ErrorCode::ModelInvalid,
            AdapterErrorKind::InsufficientMemory => ErrorCode::BackendUnavailable,
            AdapterErrorKind::EngineLoadFailed => ErrorCode::EngineLoadFailed,
            AdapterErrorKind::GenerationFailed => ErrorCode::GenerationFailed,
            AdapterErrorKind::Cancelled => ErrorCode::Cancelled,
            AdapterErrorKind::Busy => ErrorCode::EngineBusy,
            AdapterErrorKind::CallbackViolation => ErrorCode::GenerationContractViolation,
        };
        Self::new(code, error.message)
            .with_backend(BackendId::gemma_mlx())
            .with_model(
                ModelId::new(cuttledoc_gemma_mlx::MODEL_ID)
                    .expect("the built-in Gemma model ID is valid"),
            )
    }
}

impl From<cuttledoc_openrouter::AdapterError> for CuttledocError {
    fn from(error: cuttledoc_openrouter::AdapterError) -> Self {
        use cuttledoc_openrouter::AdapterErrorKind;

        let code = match error.kind {
            AdapterErrorKind::UnsupportedPlatform => ErrorCode::UnsupportedPlatform,
            AdapterErrorKind::CredentialsMissing => ErrorCode::AuthenticationFailed,
            AdapterErrorKind::InvalidInput => ErrorCode::InvalidInput,
            AdapterErrorKind::AuthenticationFailed => ErrorCode::AuthenticationFailed,
            AdapterErrorKind::TransportFailed => ErrorCode::GenerationFailed,
            AdapterErrorKind::ResponseInvalid | AdapterErrorKind::ProviderDrift => {
                ErrorCode::GenerationContractViolation
            }
            AdapterErrorKind::Cancelled => ErrorCode::Cancelled,
        };
        Self::new(code, error.message)
            .with_backend(BackendId::openrouter())
            .with_model(
                ModelId::new(cuttledoc_openrouter::MODEL_ID)
                    .expect("the built-in OpenRouter model ID is valid"),
            )
    }
}

pub type Result<T> = std::result::Result<T, CuttledocError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_code_serialization_is_stable() {
        assert_eq!(ErrorCode::EngineBusy.as_str(), "ENGINE_BUSY");
        assert_eq!(
            ErrorCode::GenerationContractViolation.as_str(),
            "GENERATION_CONTRACT_VIOLATION"
        );
        assert_eq!(ErrorCode::Cancelled.as_str(), "CANCELLED");
    }
}
