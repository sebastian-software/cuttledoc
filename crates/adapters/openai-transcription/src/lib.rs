//! Private portable boundary for OpenAI's bounded transcription endpoint.
//!
//! The adapter owns the fixed provider endpoint, wire contract, credentials,
//! cancellation, and diagnostics. No provider type is exposed to Cuttledoc's
//! public API.

use std::error::Error;
use std::fmt;
use std::time::Duration;

pub const BACKEND_ID: &str = "openai-transcription";
pub const API_KEY_ENV: &str = "OPENAI_API_KEY";
pub const ENDPOINT: &str = "https://api.openai.com/v1/audio/transcriptions";
pub const DEFAULT_MODEL_ID: &str = "gpt-4o-transcribe";
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(300);
pub const MAXIMUM_UPLOAD_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdapterErrorKind {
    CredentialsMissing,
    InvalidInput,
    AuthenticationFailed,
    RateLimited,
    TimedOut,
    TransportFailed,
    ResponseInvalid,
    Cancelled,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdapterError {
    pub kind: AdapterErrorKind,
    pub message: String,
}

impl AdapterError {
    fn new(kind: AdapterErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl fmt::Display for AdapterError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?}: {}", self.kind, self.message)
    }
}

impl Error for AdapterError {}

#[derive(Clone, Eq, PartialEq)]
pub struct Credential(String);

impl Credential {
    pub fn new(value: String) -> Result<Self, AdapterError> {
        if value.trim().is_empty() || value.trim() != value || value.chars().any(char::is_control) {
            return Err(AdapterError::new(
                AdapterErrorKind::CredentialsMissing,
                "OpenAI API key is missing or invalid",
            ));
        }
        Ok(Self(value))
    }

    pub fn from_environment() -> Result<Self, AdapterError> {
        let value = std::env::var(API_KEY_ENV).map_err(|_| {
            AdapterError::new(
                AdapterErrorKind::CredentialsMissing,
                format!("OpenAI requires {API_KEY_ENV} or an in-memory credential"),
            )
        })?;
        Self::new(value)
    }

    #[cfg(test)]
    fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Credential {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Credential([REDACTED])")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_debug_output_is_redacted() {
        let credential = Credential::new("sk-test-secret".to_owned()).expect("valid credential");
        let debug = format!("{credential:?}");
        assert_eq!(debug, "Credential([REDACTED])");
        assert!(!debug.contains(credential.expose()));
    }

    #[test]
    fn invalid_credentials_return_bounded_diagnostics() {
        for value in ["", " ", " sk-test", "sk-test\n"] {
            let error = Credential::new(value.to_owned()).expect_err("credential must fail");
            assert_eq!(error.kind, AdapterErrorKind::CredentialsMissing);
            assert!(!error.message.contains("sk-test"));
        }
    }
}
