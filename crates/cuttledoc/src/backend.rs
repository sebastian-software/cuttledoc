use std::error::Error;
use std::fmt;

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BackendId(String);

impl BackendId {
    pub fn new(value: impl Into<String>) -> Result<Self, BackendIdError> {
        let value = value.into();
        if value.trim().is_empty() {
            return Err(BackendIdError);
        }
        Ok(Self(value))
    }

    pub fn apple_speech() -> Self {
        Self(cuttledoc_apple_speech::BACKEND_ID.to_owned())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for BackendId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BackendIdError;

impl fmt::Display for BackendIdError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("backend identifier must not be empty")
    }
}

impl Error for BackendIdError {}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub enum BackendSelection {
    #[default]
    Auto,
    Id(BackendId),
}

pub fn known_backend_ids() -> Vec<BackendId> {
    vec![BackendId::apple_speech()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backend_ids_are_open_but_not_empty() {
        assert_eq!(
            BackendId::new("custom-backend").expect("valid ID").as_str(),
            "custom-backend"
        );
        assert!(BackendId::new("").is_err());
    }
}
