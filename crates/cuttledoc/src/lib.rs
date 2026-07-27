//! Public domain contracts and orchestration boundary for Cuttledoc.

mod audio;
mod backend;
mod cancellation;
mod capability;
mod enhancement;
mod error;
mod generation;
mod lifecycle;
mod media;
mod pipeline;
mod progress;
mod recognition;
mod transcript;

pub use audio::{AudioFormat, PcmBuffer, SampleFormat};
pub use backend::{BackendId, BackendSelection, known_backend_ids};
pub use cancellation::CancellationToken;
pub use capability::{
    Availability, AvailabilityReason, CancellationBoundary, RecognitionAssetInventory,
    RecognitionCapabilities, TextGenerationCapabilities, recognition_asset_inventory,
    recognition_capabilities, text_generation_capabilities,
};
pub use cuttledoc_models::{
    ArtifactFetcher, ArtifactManifest, BUILT_IN_MANIFESTS, CACHE_ROOT_ENV, ManifestId,
    ModelDescriptor, ModelError, ModelErrorCode, ModelId, ModelManager, ModelManifest,
    ModelOperations, ModelProgress, ModelProgressPhase, ModelProvisioning, ModelResult, ModelState,
    ProviderId, built_in_manifest, default_cache_root,
};
pub use enhancement::{
    EnhancementFallbackReason, EnhancementOutcome, EnhancementSection, EnhancementSectionResult,
    TranscriptEnhancementRequest, TranscriptEnhancementResult, WordDiff, enhance_transcript,
    enhance_transcript_with_progress,
};
pub use error::{CuttledocError, ErrorCode, Result};
pub use generation::{
    FinishReason, GenerationMessage, GenerationOptions, GenerationOutputFormat, GenerationRequest,
    GenerationResult, GenerationRole, GenerationUpdate, GenerationUsage,
    OpenRouterGenerationEngine, OpenRouterGenerationOptions, TextGenerationEngine,
};
#[cfg(feature = "local-runtimes")]
pub use generation::{GemmaGenerationEngine, GemmaGenerationOptions};
pub use lifecycle::{EngineState, QueuePolicy};
pub use media::{
    MediaDecodeOptions, transcribe_file, transcribe_file_with_cancellation,
    transcribe_file_with_progress,
};
pub use pipeline::{
    TranscriptEnhancementContext, TranscriptEnhancementMode, apply_transcript_enhancement,
};
pub use progress::{ProgressEvent, ProgressPhase};
pub use recognition::{
    transcribe_pcm, transcribe_pcm_with_cancellation, transcribe_pcm_with_progress,
};
pub use transcript::{
    ContractError, HostedCredential, HostedTranscriptionOptions, Stability, TimeRange,
    TranscribeOptions, TranscriptReducer, TranscriptionResult, TranscriptionSegment,
    TranscriptionUpdate, TranscriptionUpdateKind, WordTimestamp,
};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
