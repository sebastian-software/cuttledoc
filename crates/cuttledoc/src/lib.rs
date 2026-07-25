//! Public domain contracts and orchestration boundary for Cuttledoc.

mod audio;
mod backend;
mod cancellation;
mod capability;
mod error;
mod lifecycle;
mod progress;
mod recognition;
mod transcript;

pub use audio::{AudioFormat, PcmBuffer, SampleFormat};
pub use backend::{BackendId, BackendSelection, known_backend_ids};
pub use cancellation::CancellationToken;
pub use capability::{
    Availability, AvailabilityReason, CancellationBoundary, RecognitionAssetInventory,
    RecognitionCapabilities, recognition_asset_inventory, recognition_capabilities,
};
pub use cuttledoc_models::{
    ManifestId, ModelDescriptor, ModelId, ModelOperations, ModelProvisioning, ModelState,
    ProviderId,
};
pub use error::{CuttledocError, ErrorCode, Result};
pub use lifecycle::{EngineState, QueuePolicy};
pub use progress::{ProgressEvent, ProgressPhase};
pub use recognition::{transcribe_pcm, transcribe_pcm_with_cancellation};
pub use transcript::{
    ContractError, Stability, TimeRange, TranscribeOptions, TranscriptReducer, TranscriptionResult,
    TranscriptionSegment, TranscriptionUpdate, TranscriptionUpdateKind, WordTimestamp,
};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
