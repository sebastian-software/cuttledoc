//! Runtime-neutral model identity and provisioning contracts.

use std::error::Error;
use std::fmt;

macro_rules! identifier {
    ($name:ident, $kind:literal) => {
        #[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Result<Self, IdentityError> {
                let value = value.into();
                if value.trim().is_empty() {
                    return Err(IdentityError { kind: $kind });
                }
                Ok(Self(value))
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(&self.0)
            }
        }
    };
}

identifier!(ModelId, "model");
identifier!(ProviderId, "provider");
identifier!(ManifestId, "manifest");

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct IdentityError {
    kind: &'static str,
}

impl IdentityError {
    pub const fn kind(self) -> &'static str {
        self.kind
    }
}

impl fmt::Display for IdentityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} identifier must not be empty", self.kind)
    }
}

impl Error for IdentityError {}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModelProvisioning {
    CuttledocManaged,
    SystemManaged,
    Remote,
}

impl ModelProvisioning {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CuttledocManaged => "cuttledoc_managed",
            Self::SystemManaged => "system_managed",
            Self::Remote => "remote",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct ModelOperations {
    pub install: bool,
    pub verify: bool,
    pub remove: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ModelState {
    Available,
    Missing,
    Invalid,
    ProviderUnavailable,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModelDescriptor {
    pub id: ModelId,
    pub provider: ProviderId,
    pub provisioning: ModelProvisioning,
    pub state: ModelState,
    pub operations: ModelOperations,
    pub manifest: Option<ManifestId>,
    pub revision: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiers_reject_empty_values() {
        let error = ModelId::new("  ").expect_err("empty model ID must fail");
        assert_eq!(error.kind(), "model");
        assert_eq!(error.to_string(), "model identifier must not be empty");
    }

    #[test]
    fn provisioning_names_are_stable() {
        assert_eq!(
            ModelProvisioning::CuttledocManaged.as_str(),
            "cuttledoc_managed"
        );
        assert_eq!(ModelProvisioning::SystemManaged.as_str(), "system_managed");
        assert_eq!(ModelProvisioning::Remote.as_str(), "remote");
    }
}
