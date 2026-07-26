use crate::{BackendId, CuttledocError, ErrorCode, ModelId, Result};

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
    pub locales: Vec<String>,
    pub segment_timestamps: bool,
    pub word_timestamps: bool,
    pub confidence: bool,
    pub incremental_finals: bool,
    pub volatile_results: bool,
    pub max_concurrent_requests: u16,
    pub cancellation_boundary: CancellationBoundary,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecognitionAssetInventory {
    pub backend: BackendId,
    pub supported_locales: Vec<String>,
    pub installed_locales: Vec<String>,
    pub reserved_locales: Vec<String>,
    pub maximum_reserved_locales: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextGenerationCapabilities {
    pub backend: BackendId,
    pub model: ModelId,
    pub availability: Availability,
    pub local: bool,
    pub structured_output: bool,
    pub maximum_output_tokens: u32,
    pub maximum_concurrent_requests: u16,
    pub cancellation_boundary: CancellationBoundary,
    pub minimum_unified_memory_bytes: Option<u64>,
    pub required_available_memory_bytes: Option<u64>,
}

pub fn recognition_capabilities() -> Vec<RecognitionCapabilities> {
    vec![apple_speech_capabilities(), whisper_capabilities()]
}

pub fn text_generation_capabilities() -> Vec<TextGenerationCapabilities> {
    vec![gemma_mlx_capabilities(), openrouter_capabilities()]
}

pub fn recognition_asset_inventory(backend: &BackendId) -> Result<RecognitionAssetInventory> {
    if backend != &BackendId::apple_speech() {
        return Err(CuttledocError::new(
            ErrorCode::BackendUnavailable,
            format!("recognition backend {backend} is not implemented"),
        )
        .with_backend(backend.clone()));
    }
    let inventory = cuttledoc_apple_speech::locale_inventory().map_err(CuttledocError::from)?;
    Ok(RecognitionAssetInventory {
        backend: backend.clone(),
        supported_locales: inventory.supported,
        installed_locales: inventory.installed,
        reserved_locales: inventory.reserved,
        maximum_reserved_locales: inventory.maximum_reserved,
    })
}

fn apple_speech_capabilities() -> RecognitionCapabilities {
    use cuttledoc_apple_speech::BuildSupport;

    let (availability, languages, locales) = match cuttledoc_apple_speech::build_support() {
        BuildSupport::SupportedHost => {
            match recognition_asset_inventory(&BackendId::apple_speech()) {
                Ok(inventory) if !inventory.supported_locales.is_empty() => (
                    Availability::Available,
                    language_identifiers(&inventory.supported_locales),
                    inventory.supported_locales,
                ),
                Ok(_) => (
                    Availability::Unavailable {
                        reason: AvailabilityReason::SystemAssetUnavailable,
                        detail: "Apple Speech reported no supported locales for this process"
                            .to_owned(),
                        remediation: Some(
                            "verify macOS Speech assets and unrestricted system-service access"
                                .to_owned(),
                        ),
                    },
                    Vec::new(),
                    Vec::new(),
                ),
                Err(error) => (
                    Availability::Unavailable {
                        reason: AvailabilityReason::NativeLoadFailed,
                        detail: error.message,
                        remediation: Some(
                            "verify the installed macOS version and Speech framework access"
                                .to_owned(),
                        ),
                    },
                    Vec::new(),
                    Vec::new(),
                ),
            }
        }
        BuildSupport::UnsupportedHost => (
            Availability::Unavailable {
                reason: AvailabilityReason::UnsupportedPlatform,
                detail: "Apple Speech requires macOS 26 or newer on Apple Silicon".to_owned(),
                remediation: None,
            },
            Vec::new(),
            Vec::new(),
        ),
    };

    RecognitionCapabilities {
        backend: BackendId::apple_speech(),
        model: None,
        availability,
        file_input: false,
        bounded_pcm_input: true,
        streaming_pcm_input: true,
        dynamic_locales: true,
        languages,
        locales,
        segment_timestamps: true,
        word_timestamps: true,
        confidence: true,
        incremental_finals: true,
        volatile_results: true,
        max_concurrent_requests: 1,
        cancellation_boundary: CancellationBoundary::InputChunk,
    }
}

fn whisper_capabilities() -> RecognitionCapabilities {
    use cuttledoc_whisper::{AdapterErrorKind, BuildSupport};

    let model =
        ModelId::new(cuttledoc_whisper::MODEL_ID).expect("the built-in Whisper model ID is valid");
    let availability = match cuttledoc_whisper::build_support() {
        BuildSupport::UnsupportedPlatform => Availability::Unavailable {
            reason: AvailabilityReason::UnsupportedPlatform,
            detail: "Whisper requires macOS 26 or newer on Apple Silicon".to_owned(),
            remediation: None,
        },
        BuildSupport::SourceNotPrepared => Availability::Unavailable {
            reason: AvailabilityReason::NativeComponentUnavailable,
            detail: "Whisper was not included in this Cuttledoc build".to_owned(),
            remediation: Some(
                "use a release artifact with Whisper support or build with the ADR-0017 source"
                    .to_owned(),
            ),
        },
        BuildSupport::Native => match cuttledoc_whisper::configured_model_path() {
            None => Availability::Unavailable {
                reason: AvailabilityReason::ModelMissing,
                detail: "Whisper large-v3-turbo is not installed".to_owned(),
                remediation: Some(format!(
                    "set {} or install the paired model in the Cuttledoc cache",
                    cuttledoc_whisper::MODEL_PATH_ENV
                )),
            },
            Some(path) => match cuttledoc_whisper::validate_model(&path) {
                Ok(()) => Availability::Available,
                Err(error) => Availability::Unavailable {
                    reason: match error.kind {
                        AdapterErrorKind::ModelMissing => AvailabilityReason::ModelMissing,
                        _ => AvailabilityReason::ModelInvalid,
                    },
                    detail: error.message,
                    remediation: Some(
                        "install or select the pinned GGML and Core ML model pair".to_owned(),
                    ),
                },
            },
        },
    };

    RecognitionCapabilities {
        backend: BackendId::whisper(),
        model: Some(model),
        availability,
        file_input: false,
        bounded_pcm_input: true,
        streaming_pcm_input: false,
        dynamic_locales: false,
        languages: cuttledoc_whisper::SUPPORTED_LANGUAGES
            .iter()
            .map(|value| (*value).to_owned())
            .collect(),
        locales: Vec::new(),
        segment_timestamps: true,
        word_timestamps: false,
        confidence: false,
        incremental_finals: false,
        volatile_results: false,
        max_concurrent_requests: 1,
        cancellation_boundary: CancellationBoundary::DecoderStep,
    }
}

fn gemma_mlx_capabilities() -> TextGenerationCapabilities {
    use cuttledoc_gemma_mlx::{AdapterErrorKind, BuildSupport, MemoryGate};

    let backend = BackendId::gemma_mlx();
    let model =
        ModelId::new(cuttledoc_gemma_mlx::MODEL_ID).expect("the built-in Gemma model ID is valid");
    let availability = match cuttledoc_gemma_mlx::build_support() {
        BuildSupport::UnsupportedPlatform => Availability::Unavailable {
            reason: AvailabilityReason::UnsupportedPlatform,
            detail: "Gemma MLX requires macOS on Apple Silicon".to_owned(),
            remediation: None,
        },
        BuildSupport::SourceNotPrepared => Availability::Unavailable {
            reason: AvailabilityReason::NativeComponentUnavailable,
            detail: "Gemma MLX was not included in this Cuttledoc build".to_owned(),
            remediation: Some(
                "use a release artifact with Gemma support or build with the ADR-0014 MLX source"
                    .to_owned(),
            ),
        },
        BuildSupport::Native => match cuttledoc_gemma_mlx::system_memory_snapshot() {
            None => Availability::Unavailable {
                reason: AvailabilityReason::UnsupportedHardware,
                detail: "unified-memory capacity could not be measured".to_owned(),
                remediation: None,
            },
            Some(memory) => match cuttledoc_gemma_mlx::evaluate_memory(memory) {
                MemoryGate::InsufficientTotal {
                    required_bytes,
                    actual_bytes,
                } => Availability::Unavailable {
                    reason: AvailabilityReason::UnsupportedHardware,
                    detail: format!(
                        "Gemma requires {required_bytes} bytes of unified memory; the host reports {actual_bytes}"
                    ),
                    remediation: Some(
                        "leave transcript enhancement disabled or select explicit hosted enhancement"
                            .to_owned(),
                    ),
                },
                MemoryGate::InsufficientHeadroom {
                    required_bytes,
                    actual_bytes,
                } => Availability::Unavailable {
                    reason: AvailabilityReason::UnsupportedHardware,
                    detail: format!(
                        "Gemma requires {required_bytes} currently available bytes; the host reports {actual_bytes}"
                    ),
                    remediation: Some(
                        "release other heavyweight workloads before enabling local enhancement"
                            .to_owned(),
                    ),
                },
                MemoryGate::Ready => match cuttledoc_gemma_mlx::configured_model_directory() {
                    None => Availability::Unavailable {
                        reason: AvailabilityReason::ModelMissing,
                        detail: "Gemma 4 26B-A4B 4-bit is not installed".to_owned(),
                        remediation: Some(format!(
                            "set {} or install the pinned model in the Cuttledoc cache",
                            cuttledoc_gemma_mlx::MODEL_PATH_ENV
                        )),
                    },
                    Some(path) => match cuttledoc_gemma_mlx::validate_model(&path) {
                        Ok(()) => Availability::Available,
                        Err(error) => Availability::Unavailable {
                            reason: match error.kind {
                                AdapterErrorKind::ModelMissing => AvailabilityReason::ModelMissing,
                                _ => AvailabilityReason::ModelInvalid,
                            },
                            detail: error.message,
                            remediation: Some(
                                "install or select the exact ADR-0014 model snapshot".to_owned(),
                            ),
                        },
                    },
                },
            },
        },
    };

    TextGenerationCapabilities {
        backend,
        model,
        availability,
        local: true,
        structured_output: false,
        maximum_output_tokens: 4_096,
        maximum_concurrent_requests: 1,
        cancellation_boundary: CancellationBoundary::DecoderStep,
        minimum_unified_memory_bytes: Some(cuttledoc_gemma_mlx::MINIMUM_UNIFIED_MEMORY_BYTES),
        required_available_memory_bytes: Some(cuttledoc_gemma_mlx::REQUIRED_AVAILABLE_MEMORY_BYTES),
    }
}

fn openrouter_capabilities() -> TextGenerationCapabilities {
    let backend = BackendId::openrouter();
    let model = ModelId::new(cuttledoc_openrouter::MODEL_ID)
        .expect("the built-in OpenRouter model ID is valid");
    let availability = match cuttledoc_openrouter::build_support() {
        cuttledoc_openrouter::BuildSupport::UnsupportedPlatform => Availability::Unavailable {
            reason: AvailabilityReason::UnsupportedPlatform,
            detail: "the OpenRouter Foundation adapter requires macOS on Apple Silicon".to_owned(),
            remediation: None,
        },
        cuttledoc_openrouter::BuildSupport::Native => {
            match cuttledoc_openrouter::Credential::from_environment() {
                Ok(_) => Availability::Available,
                Err(_) => Availability::Unavailable {
                    reason: AvailabilityReason::CredentialsMissing,
                    detail: "an OpenRouter credential is not configured in the environment"
                        .to_owned(),
                    remediation: Some(format!(
                        "set {} or provide an in-memory credential when explicitly selecting hosted enhancement",
                        cuttledoc_openrouter::API_KEY_ENV
                    )),
                },
            }
        }
    };

    TextGenerationCapabilities {
        backend,
        model,
        availability,
        local: false,
        structured_output: true,
        maximum_output_tokens: 4_096,
        maximum_concurrent_requests: 1,
        cancellation_boundary: CancellationBoundary::Request,
        minimum_unified_memory_bytes: None,
        required_available_memory_bytes: None,
    }
}

fn language_identifiers(locales: &[String]) -> Vec<String> {
    let mut languages = locales
        .iter()
        .filter_map(|locale| locale.split(['_', '-']).next())
        .filter(|language| !language.is_empty())
        .map(str::to_lowercase)
        .collect::<Vec<_>>();
    languages.sort_unstable();
    languages.dedup();
    languages
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_state_matches_the_runtime_inventory() {
        let apple = recognition_capabilities()
            .into_iter()
            .find(|capability| capability.backend.as_str() == "apple-speech")
            .expect("Apple Speech is a known backend");

        if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            assert!(!apple.availability.is_available());
            assert_eq!(
                apple.availability.reason(),
                Some(AvailabilityReason::UnsupportedPlatform)
            );
        } else if apple.availability.is_available() {
            assert!(!apple.languages.is_empty());
            assert!(!apple.locales.is_empty());
        } else {
            assert!(!apple.availability.is_available());
            assert!(matches!(
                apple.availability.reason(),
                Some(
                    AvailabilityReason::SystemAssetUnavailable
                        | AvailabilityReason::NativeLoadFailed
                )
            ));
        }
    }

    #[test]
    fn language_identifiers_are_unique_and_normalized() {
        assert_eq!(
            language_identifiers(&["en_US".to_owned(), "de-DE".to_owned(), "en_GB".to_owned()]),
            vec!["de", "en"]
        );
    }

    #[test]
    fn whisper_capability_matches_the_pinned_language_table() {
        let whisper = recognition_capabilities()
            .into_iter()
            .find(|capability| capability.backend == BackendId::whisper())
            .expect("Whisper is a known backend");
        assert_eq!(
            whisper.model.as_ref().map(ModelId::as_str),
            Some(cuttledoc_whisper::MODEL_ID)
        );
        assert_eq!(whisper.languages.len(), 100);
        for language in ["de", "en", "es", "fr", "pt", "yue"] {
            assert!(whisper.languages.iter().any(|value| value == language));
        }
        assert!(whisper.segment_timestamps);
        assert!(!whisper.confidence);
        assert!(!whisper.streaming_pcm_input);
    }

    #[test]
    fn generation_capabilities_publish_local_and_hosted_gates() {
        let capabilities = text_generation_capabilities();
        assert_eq!(capabilities.len(), 2);
        let gemma = capabilities
            .iter()
            .find(|capability| capability.backend == BackendId::gemma_mlx())
            .expect("Gemma is a known generation backend");
        assert_eq!(gemma.backend, BackendId::gemma_mlx());
        assert!(gemma.local);
        assert_eq!(gemma.maximum_concurrent_requests, 1);
        assert_eq!(
            gemma.minimum_unified_memory_bytes,
            Some(cuttledoc_gemma_mlx::MINIMUM_UNIFIED_MEMORY_BYTES)
        );
        assert_eq!(
            gemma.required_available_memory_bytes,
            Some(cuttledoc_gemma_mlx::REQUIRED_AVAILABLE_MEMORY_BYTES)
        );

        let openrouter = capabilities
            .iter()
            .find(|capability| capability.backend == BackendId::openrouter())
            .expect("OpenRouter is a known generation backend");
        assert!(!openrouter.local);
        assert!(openrouter.structured_output);
        assert_eq!(openrouter.minimum_unified_memory_bytes, None);
        assert_eq!(
            openrouter.cancellation_boundary,
            CancellationBoundary::Request
        );
    }
}
