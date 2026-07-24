# Proposed public APIs

## Status

This document is the Phase 0 boundary decision, not yet a published
compatibility promise. Task separation, worker ownership, open backend IDs,
capability discovery, and streaming semantics are settled by ADR-0010; exact
Rust names remain provisional until the first vertical slice.

## API layers

Cuttledoc exposes two deliberate levels:

1. A high-level one-shot API for most applications.
2. A reusable engine API for loaded models, repeated transcription, explicit lifecycle, progress, and cancellation.

Model management and capability discovery are first-class. Backend implementation objects are not exposed.

Speech recognition and text generation are separate initial task APIs. They may share model management, progress, cancellation, diagnostics, errors, and lifecycle concepts, but they do not share a generic tensor or inference-runtime interface. Speech synthesis is a strategic direction whose public contract is deferred until a Phase 5 vertical slice (ADR-0009). See ADR-0004.

Backend identifiers are product choices, not runtime identities. CoreML, MLX,
Metal, Apple system APIs, and native upstream implementations remain internal
adapters. If multiple runtimes execute the same model family, runtime selection
does not change `TranscriptionResult`.

## Initial task contracts

The following shapes establish architectural boundaries; exact Rust async syntax and names remain provisional:

```rust
pub trait SpeechRecognitionEngine {
    async fn transcribe(
        &self,
        audio: RecognitionInput,
        options: TranscribeOptions,
    ) -> Result<TranscriptionStream>;
}

pub trait TextGenerationEngine {
    async fn generate(
        &self,
        request: GenerationRequest,
    ) -> Result<TextStream>;
}
```

Audio input primitives support file, in-memory PCM, and streaming recognition use cases:

```rust
pub enum RecognitionInput {
    File(PathBuf),
    Pcm(PcmBuffer),
    Stream(PcmInput),
}

pub struct AudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: SampleFormat,
}

pub struct PcmBuffer {
    pub format: AudioFormat,
    pub samples: Arc<[f32]>,
}
```

`PcmInput::write` is asynchronous and bounded. A full input queue waits or
returns explicit backpressure according to engine policy; it never drops caller
audio. The caller owns capture, and the library owns or copies accepted sample
buffers before `write` completes.

Recognition streams transcript updates. Generation uses a distinct ordered
delta stream with no audio range semantics:

```rust
pub struct GenerationUpdate {
    pub sequence: u64,
    pub text_delta: String,
    pub token_ids: Option<Vec<u32>>,
    pub finish_reason: Option<FinishReason>,
    pub usage: Option<GenerationUsage>,
}
```

The generation request is provider- and runtime-neutral:

```rust
pub struct GenerationRequest {
    pub model: Option<ModelId>,
    pub messages: Vec<GenerationMessage>,
    pub output_format: GenerationOutputFormat,
    pub options: GenerationOptions,
}

pub struct GenerationMessage {
    pub role: GenerationRole,
    pub content: String,
}

pub enum GenerationRole {
    System,
    User,
    Assistant,
}

pub enum GenerationOutputFormat {
    Text,
    JsonObject,
}

pub struct GenerationOptions {
    pub max_output_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<u32>,
    pub seed: Option<u64>,
    pub stop: Vec<String>,
}
```

Every option is optional because support varies by backend and model. The
capability record states whether seeded determinism, greedy decoding,
structured output, token identifiers, and each sampler control are supported.
An explicitly requested unsupported option returns a capability error; an
adapter never silently approximates or discards it. Credentials, provider
URLs, local process discovery, and runtime preferences remain context/provider
configuration rather than fields on a generation request.

Generation updates are ordered and append-only. `sequence` starts at zero and
increases by one. Text deltas never rewrite or revoke prior text; a completion-
only provider may emit one update. `token_ids` are optional diagnostics rather
than portable text identity. Exactly one terminal update contains
`finish_reason` and optional usage. Bounded backpressure never drops deltas,
and cancellation terminates the stream with the common cancelled error at the
backend's advertised safe boundary.

Transcript enhancement is orchestration above this engine. It selects and
hashes prompts, chunks long transcripts, supplies language/domain context,
compares the generated output with the raw input, applies protected-span and
lexical guards, and retains both raw and accepted text. Consequently OpenAI,
Ollama, a future official-MLX adapter, and a possible llama.cpp adapter can
implement the same engine without moving prompt policy into a runtime adapter.
STT output is never overwritten in place.

Both streams define cancellation and backpressure behavior. Phase 5 must use a
real TTS runtime to validate output sample ownership, chunk timing, format
negotiation, cancellation, and backpressure before adding a
`SpeechSynthesisEngine` contract.

## Identity and shared domain model

The public vocabulary is intentionally precise:

| Term | Public meaning |
| --- | --- |
| Task | Stable operation and result contract: speech recognition or text generation. |
| Backend | Product-selectable implementation of one task. |
| Runtime | Internal substrate such as CoreML, official MLX, whisper.cpp/Metal, Apple Speech, or HTTP. |
| Model | Logical revisioned unit; may be local artifacts, a system asset, or a remote model ID. |
| Provider | Authority that provisions a model/service, credentials, or system assets. |
| Capability | Discovered behavior of one backend/model/provider configuration on this host. |

`auto` is a selection policy, not a backend. Backend IDs are open product
identifiers so Rust and Node can evolve together:

```rust
pub struct BackendId(String);

pub enum BackendSelection {
    Auto,
    Id(BackendId),
}

pub struct TranscribeOptions {
    pub backend: BackendSelection,
    pub model: Option<ModelId>,
    pub language: Option<String>,
}

pub struct TranscriptionResult {
    pub text: String,
    pub language: Option<String>,
    pub backend: BackendId,
    pub model: Option<ModelId>,
    pub media_duration: Duration,
    pub processing_duration: Duration,
    pub segments: Vec<TranscriptionSegment>,
}

pub struct TranscriptionSegment {
    pub text: String,
    pub start: Duration,
    pub end: Duration,
    pub confidence: Option<f32>,
    pub words: Vec<WordTimestamp>,
}
```

Known constants/completions initially cover `parakeet-local`, `whisper-local`,
`apple-speech`, and `openai-transcription`. The MLX proof now implements one
end-to-end task, but it does not receive a public backend ID until the bakeoff
selects and productizes it; runtime evidence alone does not define product
identity.

TypeScript uses the same open policy rather than a closed union that makes
widening a breaking change:

```ts
type KnownBackend =
  | "parakeet-local"
  | "whisper-local"
  | "apple-speech"
  | "openai-transcription";
type BackendId = KnownBackend | (string & {});
type BackendSelection = "auto" | BackendId;
```

Credentials and provider-specific connection settings belong on the
`Cuttledoc` context/provider configuration, not in common transcription
options. Capability discovery, not a constant list, is the source of truth for
availability.

Time is strongly typed in Rust. Node conversions use seconds consistently at the public boundary rather than mixing Parakeet seconds and Whisper milliseconds.

## Rust one-shot API

```rust
use cuttledoc::{transcribe, BackendSelection, TranscribeOptions};

let result = transcribe(
    "meeting.mp4",
    TranscribeOptions {
        backend: BackendSelection::Auto,
        language: Some("de".into()),
        ..Default::default()
    },
)
.await?;

println!("{}", result.text);
```

The top-level one-shot API owns an ephemeral context and closes its engine
before returning. Applications that need warm reuse create an explicit
`Cuttledoc` context; no hidden process-global engine cache exists.

## Rust reusable engine API

```rust
let cuttledoc = Cuttledoc::builder()
    .cache_root("/srv/cuttledoc")
    .build()?;

let engine = cuttledoc
    .speech_recognition_engine("parakeet-local")
    .language("de")
    .auto_install(false)
    .queue_policy(QueuePolicy::Wait { capacity: 4 })
    .build()
    .await?;

let result = engine.transcribe_path("meeting.mp4").await?;

// Advanced callers can bypass media decoding.
let result = engine
    .transcribe_pcm(&samples, 16_000, 1)
    .await?;

engine.close().await?;
cuttledoc.close().await?;
```

The public engine is a `Send + Sync` proxy; its native state does not have to
be. Each engine owns an adapter worker/actor and a bounded FIFO queue. Execution
is serialized by default. A capability may report a higher bounded concurrency
only after the backend proves it safe. `QueuePolicy::Reject` returns
`ENGINE_BUSY` instead of waiting.

`close()` is idempotent and deterministic: stop admission, cancel queued and
active work, wait for the backend's reported safe cancellation boundary,
destroy native state on its owner, and finish result streams. `Drop` and Node
finalizers are best-effort fallbacks, not substitutes for awaiting `close()`.

## Model API

```rust
let models = cuttledoc.models();

for model in models.list().await? {
    println!("{} {:?}", model.id, model.state);
}

models
    .download("parakeet-tdt-0.6b-v3")
    .progress(|event| println!("{event:?}"))
    .await?;

models.verify("whisper-large-v3-turbo").await?;
models.remove("whisper-large-v3-turbo").await?;
```

Model states:

- `missing`
- `partial`
- `downloading`
- `verifying`
- `ready`
- `invalid`

Model IDs are stable product identifiers. Upstream filenames remain manifest
details. A descriptor also reports provisioning:

```rust
pub enum ModelProvisioning {
    CuttledocManaged { manifest: ManifestId },
    SystemManaged { provider: ProviderId },
    Remote { provider: ProviderId },
}

pub struct ModelOperations {
    pub install: bool,
    pub verify: bool,
    pub remove: bool,
}
```

System Speech may support install/reservation without exposing artifact bytes,
digest, quantization, or revision. Remote models expose no local file
operations. Callers inspect `ModelOperations` instead of assuming every model
has a downloadable artifact tree.

## Capabilities API

```rust
let capabilities = cuttledoc.capabilities().await;

for backend in capabilities.backends {
    println!("{}: {:?}", backend.id, backend.availability);
}
```

Availability is machine-readable:

```rust
pub enum Availability {
    Available,
    Unavailable {
        reason: AvailabilityReason,
        detail: Option<String>,
        remediation: Option<Remediation>,
    },
}

#[non_exhaustive]
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
```

Node and CLI serialize the stable reason codes as `snake_case`. Human detail
may evolve independently. Recognition capabilities additionally report:

- file, bounded PCM, and streaming PCM input;
- dynamic or enumerated languages/locales;
- segment/word timestamps and confidence;
- incremental finals and volatile replacements;
- model provisioning and supported operations;
- serialized or bounded-concurrent execution;
- queue/backpressure behavior;
- cancellation boundary; and
- optional runtime/model revision diagnostics.

Runtime diagnostics may mention CoreML, MLX, Metal, Apple Speech, or a remote
provider. They do not alter task results or become selection handles.

## Progress, cancellation, backpressure, and shutdown

```rust
let cancellation = CancellationToken::new();

let result = engine
    .transcribe("meeting.mp4")
    .progress(|event| match event {
        ProgressEvent::Decoding { percent } => { /* ... */ }
        ProgressEvent::Transcribing { segment, total } => { /* ... */ }
        _ => {}
    })
    .cancellation(cancellation.clone())
    .await?;
```

Progress callbacks are observational: slow callbacks must not block native
inference indefinitely. Node callbacks are dispatched through a threadsafe
function or equivalent `napi-rs` mechanism.

Cancellation is cooperative and capability-reported:

- queued work is removed immediately;
- Apple Speech can cancel its actor task and input sequence;
- synchronous MLX/native work observes cancellation at the next chunk or
  decoder step; and
- native state is never destroyed while a foreign call is active.

Streaming input and engine admission both use bounded queues. Waiting for
capacity is the default. Reject policy returns `ENGINE_BUSY`; accepted PCM is
never silently discarded.

## Streaming results

Streaming follows ADR-0008: the result contract is an ordered stream of range-addressed replacement or revocation updates. Replacement content is volatile or final. Batch transcription consumes the same stream and aggregates finalized ranges.

```rust
pub struct TranscriptionUpdate {
    pub sequence: u64,
    pub affected_range: TimeRange,
    pub kind: TranscriptionUpdateKind,
}

pub enum TranscriptionUpdateKind {
    Replace {
        segments: Vec<TranscriptionSegment>,
        stability: Stability,
    },
    Revoke,
}

pub enum Stability {
    Volatile,
    Final,
}
```

```rust
let mut updates = engine.transcribe_stream("meeting.mp4").await?;

while let Some(update) = updates.next().await {
    let TranscriptionUpdate {
        affected_range,
        kind,
        ..
    } = update?;

    match kind {
        TranscriptionUpdateKind::Replace { segments, stability } => {
            transcript.replace(affected_range, segments, stability)?;
        }
        TranscriptionUpdateKind::Revoke => {
            transcript.revoke(affected_range)?;
        }
    }
}
```

```ts
for await (const update of engine.transcribeStream("meeting.mp4")) {
  transcript.apply(update); // sequence + affectedRange + replace/revoke
}
```

Rules:

- Time ranges are half-open (`start <= t < end`). Incoming replacement
  segments are ordered, non-overlapping, and wholly contained in the affected
  range. A replacement that only partially overlaps an existing volatile
  segment is a backend contract error rather than silently deleting content
  outside the affected range.
- Backends report `supportsStreaming` (incremental finals) and `emitsVolatileResults` (revisions before finalization) as capabilities; callers rely on the report, not probing.
- Consumers apply updates in `sequence` order. `replace` removes prior non-final content in `affectedRange` before inserting the new segments; `revoke` removes it without replacement.
- Finalized ranges are immutable. Overlap with final content is surfaced as a backend contract error.
- Finals-only backends emit completed segments as they are produced; they never emit volatile updates.
- Input sources are files and caller-provided PCM feeds. The library does not capture microphone or system audio.
- Result updates are distinct from progress events; progress remains observational.

These rules are executable in the dependency-free `cuttledoc` reducer. Its
workspace tests consume the same checked-in vectors as the completed
[`spikes/stream-contract`](../spikes/stream-contract/) proof for finals-only,
volatile replacement, revocation, immutable-final overlap, sequence gaps, and
invalid ranges.

Rust domain types are authoritative. `cuttledoc-node` generates or
mechanically checks its TypeScript declarations from the Rust binding surface
in CI. The shared vectors check behavior; JavaScript does not implement a
second reducer.

## Node.js API

The Node API mirrors domain concepts while remaining idiomatic TypeScript:

```ts
import { Cuttledoc, transcribe } from "cuttledoc";

const result = await transcribe("meeting.mp4", {
  backend: "auto",
  language: "de",
});

const cuttledoc = await Cuttledoc.create({
  cacheRoot: "/srv/cuttledoc",
});

const engine = await cuttledoc.createSpeechRecognitionEngine({
  backend: "parakeet-local",
  language: "de",
  autoInstall: false,
  queuePolicy: { mode: "wait", capacity: 4 },
});

const repeated = await engine.transcribe("interview.wav", {
  signal: abortController.signal,
  onProgress(event) {
    console.log(event.phase, event.percent);
  },
});

await engine.close();
await cuttledoc.close();
```

Advanced PCM input uses `Float32Array`. The Node boundary may borrow it only
for a synchronous call; the engine owns or copies accepted data before that
call returns, and a native adapter may convert formats internally:

```ts
await engine.transcribePcm(samples, {
  sampleRate: 16_000,
  channels: 1,
});
```

## Node errors

```ts
try {
  await engine.transcribe("meeting.mp4");
} catch (error) {
  if (error instanceof CuttledocError) {
    console.error(error.code, error.backend, error.model);
  }
}
```

The generated declaration should resemble:

```ts
type CuttledocErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_PLATFORM"
  | "BACKEND_UNAVAILABLE"
  | "MODEL_MISSING"
  | "MODEL_INVALID"
  | "MODEL_DOWNLOAD_FAILED"
  | "AUDIO_DECODE_FAILED"
  | "ENGINE_BUSY"
  | "ENGINE_CLOSED"
  | "ENGINE_LOAD_FAILED"
  | "BACKEND_CONTRACT_VIOLATION"
  | "TRANSCRIPTION_FAILED"
  | "AUTHENTICATION_FAILED"
  | "CANCELLED";
```

## CLI contract

Proposed commands:

```text
cuttledoc <input> [--backend auto|parakeet-local|whisper-local|apple-speech|openai-transcription]
                  [--language <code>]
                  [--output <path>]
                  [--format text|markdown|json]

cuttledoc models list
cuttledoc models download <model|all|asr>
cuttledoc models verify <model|all>
cuttledoc models remove <model>
cuttledoc backends list
cuttledoc doctor
cuttledoc benchmark <input> --reference <text>
```

Compatibility aliases from Cuttledoc 2 should be retained where they do not compromise the new model.

## Low-level exposure policy

Expose capabilities rather than implementation classes. The public API may offer PCM input, model paths, VAD tuning, and backend-specific option structs, but it should not expose:

- raw CoreML model handles;
- MLX arrays or runtime handles;
- Metal devices or command queues;
- N-API addon functions;
- whisper.cpp contexts;
- Objective-C pointers;
- cache-internal filenames;
- backend-global singleton state.

If an advanced capability cannot be expressed without exposing implementation details, first determine whether it belongs in a separate explicitly unstable module.

## Compatibility policy

- Rust follows semantic versioning once the crate is published.
- Node follows semantic versioning and documents Cuttledoc 2 migration differences.
- CLI output intended for humans may evolve; `--format json` receives a versioned schema.
- Model manifests are versioned independently of package releases but pinned by release metadata.
- Stable error codes outlive exact error messages.
