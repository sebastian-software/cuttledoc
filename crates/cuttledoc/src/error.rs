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

pub type Result<T> = std::result::Result<T, CuttledocError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_code_serialization_is_stable() {
        assert_eq!(ErrorCode::EngineBusy.as_str(), "ENGINE_BUSY");
        assert_eq!(ErrorCode::Cancelled.as_str(), "CANCELLED");
    }
}
