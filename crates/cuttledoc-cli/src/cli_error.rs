use std::fmt;

use cuttledoc::{CuttledocError, ErrorCode, ModelError};

pub type CliResult<T> = Result<T, CliError>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CliError {
    pub code: &'static str,
    pub message: String,
    pub remediation: Option<String>,
    pub exit_status: u8,
}

impl CliError {
    pub fn new(code: &'static str, message: impl Into<String>, exit_status: u8) -> Self {
        Self {
            code,
            message: message.into(),
            remediation: None,
            exit_status,
        }
    }

    pub fn usage(message: impl Into<String>) -> Self {
        Self::new("CLI_USAGE", message, 2)
    }

    pub fn with_remediation(mut self, remediation: impl Into<String>) -> Self {
        self.remediation = Some(remediation.into());
        self
    }
}

impl fmt::Display for CliError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "error[{}]: {}", self.code, self.message)?;
        if let Some(remediation) = &self.remediation {
            write!(formatter, "\nremediation: {remediation}")?;
        }
        Ok(())
    }
}

impl From<CuttledocError> for CliError {
    fn from(error: CuttledocError) -> Self {
        let remediation = match error.code {
            ErrorCode::ModelMissing | ErrorCode::ModelInvalid => Some(
                "run `cuttledoc models list` and install or verify the selected model".to_owned(),
            ),
            ErrorCode::AudioDecodeFailed => Some(
                "install FFmpeg or pass the executable explicitly with --ffmpeg-path".to_owned(),
            ),
            ErrorCode::BackendUnavailable | ErrorCode::UnsupportedPlatform => {
                Some("run `cuttledoc backends list` to inspect host capabilities".to_owned())
            }
            ErrorCode::AuthenticationFailed => Some(
                "configure the credential required by the explicitly selected hosted mode"
                    .to_owned(),
            ),
            _ => None,
        };
        Self {
            code: error.code.as_str(),
            message: error.message,
            remediation,
            exit_status: 1,
        }
    }
}

impl From<ModelError> for CliError {
    fn from(error: ModelError) -> Self {
        Self {
            code: error.code.as_str(),
            message: error.message,
            remediation: error.remediation,
            exit_status: 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_keeps_code_message_and_remediation_separate() {
        let error = CliError::new("OUTPUT_EXISTS", "output already exists", 3)
            .with_remediation("pass --force to replace it");
        assert_eq!(
            error.to_string(),
            concat!(
                "error[OUTPUT_EXISTS]: output already exists\n",
                "remediation: pass --force to replace it"
            )
        );
        assert_eq!(error.exit_status, 3);
    }
}
