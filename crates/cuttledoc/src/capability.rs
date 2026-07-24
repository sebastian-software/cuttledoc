use crate::{BackendId, ModelId};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AvailabilityReason {
    UnsupportedPlatform,
    UnsupportedHardware,
    ModelMissing,
    ModelInvalid,
    SystemAssetUnavailable,
    CredentialsMissing,
    NativeComponentUnavailable,
    DisabledByPolicy,
    NativeLoadFailed,
}

impl AvailabilityReason {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UnsupportedPlatform => "unsupported_platform",
            Self::UnsupportedHardware => "unsupported_hardware",
            Self::ModelMissing => "model_missing",
            Self::ModelInvalid => "model_invalid",
            Self::SystemAssetUnavailable => "system_asset_unavailable",
            Self::CredentialsMissing => "credentials_missing",
            Self::NativeComponentUnavailable => "native_component_unavailable",
            Self::DisabledByPolicy => "disabled_by_policy",
            Self::NativeLoadFailed => "native_load_failed",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Availability {
    Available,
    Unavailable {
        reason: AvailabilityReason,
        detail: String,
        remediation: Option<String>,
    },
}

impl Availability {
    pub const fn is_available(&self) -> bool {
        matches!(self, Self::Available)
    }

    pub const fn reason(&self) -> Option<AvailabilityReason> {
        match self {
            Self::Available => None,
            Self::Unavailable { reason, .. } => Some(*reason),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CancellationBoundary {
    Queued,
    InputChunk,
    DecoderStep,
    Request,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecognitionCapabilities {
    pub backend: BackendId,
    pub model: Option<ModelId>,
    pub availability: Availability,
    pub file_input: bool,
    pub bounded_pcm_input: bool,
    pub streaming_pcm_input: bool,
    pub dynamic_locales: bool,
    pub languages: Vec<String>,
    pub segment_timestamps: bool,
    pub word_timestamps: bool,
    pub confidence: bool,
    pub incremental_finals: bool,
    pub volatile_results: bool,
    pub max_concurrent_requests: u16,
    pub cancellation_boundary: CancellationBoundary,
}

pub fn recognition_capabilities() -> Vec<RecognitionCapabilities> {
    vec![apple_speech_capabilities()]
}

fn apple_speech_capabilities() -> RecognitionCapabilities {
    use cuttledoc_apple_speech::BuildSupport;

    let availability = match cuttledoc_apple_speech::build_support() {
        BuildSupport::SupportedHost => Availability::Unavailable {
            reason: AvailabilityReason::NativeComponentUnavailable,
            detail: "the Phase 2 Swift adapter is not linked yet".to_owned(),
            remediation: Some("install a Cuttledoc build with Apple Speech support".to_owned()),
        },
        BuildSupport::UnsupportedHost => Availability::Unavailable {
            reason: AvailabilityReason::UnsupportedPlatform,
            detail: "Apple Speech requires macOS 26 or newer on Apple Silicon".to_owned(),
            remediation: None,
        },
    };

    RecognitionCapabilities {
        backend: BackendId::apple_speech(),
        model: None,
        availability,
        file_input: false,
        bounded_pcm_input: true,
        streaming_pcm_input: true,
        dynamic_locales: true,
        languages: Vec::new(),
        segment_timestamps: true,
        word_timestamps: true,
        confidence: true,
        incremental_finals: true,
        volatile_results: true,
        max_concurrent_requests: 1,
        cancellation_boundary: CancellationBoundary::InputChunk,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unavailable_state_has_a_machine_readable_reason() {
        let apple = recognition_capabilities()
            .into_iter()
            .find(|capability| capability.backend.as_str() == "apple-speech")
            .expect("Apple Speech is a known backend");

        assert!(!apple.availability.is_available());
        let expected = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            AvailabilityReason::NativeComponentUnavailable
        } else {
            AvailabilityReason::UnsupportedPlatform
        };
        assert_eq!(apple.availability.reason(), Some(expected));
    }
}
