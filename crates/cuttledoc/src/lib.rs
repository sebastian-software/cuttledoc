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
    ManifestId, ModelDescriptor, ModelId, ModelOperations, ModelProvisioning, ModelState,
    ProviderId,
};
pub use enhancement::{
    EnhancementFallbackReason, EnhancementOutcome, EnhancementSection, EnhancementSectionResult,
    TranscriptEnhancementRequest, TranscriptEnhancementResult, WordDiff, enhance_transcript,
    enhance_transcript_with_progress,
};
pub use error::{CuttledocError, ErrorCode, Result};
pub use generation::{
    FinishReason, GemmaGenerationEngine, GemmaGenerationOptions, GenerationMessage,
    GenerationOptions, GenerationOutputFormat, GenerationRequest, GenerationResult, GenerationRole,
    GenerationUpdate, GenerationUsage, TextGenerationEngine,
};
pub use lifecycle::{EngineState, QueuePolicy};
pub use media::{MediaDecodeOptions, transcribe_file, transcribe_file_with_cancellation};
pub use progress::{ProgressEvent, ProgressPhase};
pub use recognition::{transcribe_pcm, transcribe_pcm_with_cancellation};
pub use transcript::{
    ContractError, Stability, TimeRange, TranscribeOptions, TranscriptReducer, TranscriptionResult,
    TranscriptionSegment, TranscriptionUpdate, TranscriptionUpdateKind, WordTimestamp,
};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
