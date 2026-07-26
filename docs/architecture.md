# Target architecture

## Context

The current system distributes product behavior across a TypeScript monorepo and two standalone Node native addons. That separation creates four overlapping lifecycle systems:

- Node/TypeScript orchestration and backend selection in Cuttledoc;
- Objective-C++ Parakeet inference and VAD behind N-API;
- C++/whisper.cpp inference behind a second N-API addon;
- separate package installation, model caches, CLIs, tests, and releases.

The target makes Rust the product center while preserving proven native inference implementations where rewriting them would add risk without user value. Runtime and model selection remains evidence-driven and must not shape the stable API.

## System view

```text
                         ┌─────────────────────────────┐
                         │ User applications           │
                         │ Rust │ CLI │ Node/TypeScript│
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │ Public Cuttledoc API         │
                         │ engines, models, progress,   │
                         │ cancellation, stable errors │
                         └──────────────┬──────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
    ┌─────────▼─────────┐     ┌─────────▼─────────┐     ┌─────────▼─────────┐
    │ Audio pipeline     │     │ Task engines      │     │ Model manager     │
    │ probe/decode/PCM   │     │ STT │ text gen    │     │ all provisioning  │
    │ normalize          │     │ proxy/worker/queue│     │ modes + migration │
    └─────────┬─────────┘     └─────────┬─────────┘     └───────────────────┘
              │                         │
              │          ┌──────────────┼──────────────┐
              │          │              │              │
              │  ┌───────▼───────┐ ┌────▼─────┐ ┌──────▼──────┐
              │  │ Apple-local    │ │ Native   │ │ Remote      │
              │  │ CoreML/Speech  │ │ MLX/C++  │ │ HTTP APIs   │
              │  └───────────────┘ └──────────┘ └─────────────┘
              │
              └── managed FFmpeg compatibility path initially
```

## Dependency direction

Dependencies point inward toward domain types and contracts:

```text
cuttledoc-cli ─────┐
cuttledoc-node ────┼──▶ cuttledoc ───▶ backend/audio/model abstractions
                   │                         ▲
                   └─────────────────────────┘

runtime-specific adapter crates ─▶ internal task abstractions
remote provider adapters ────────▶ internal task abstractions
cuttledoc-audio ─────────────────▶ domain audio types
cuttledoc-models ────────────────▶ provisioning and storage contracts
```

The public `cuttledoc` crate must not depend on Node.js. `cuttledoc-node` depends on the Rust API and contains only conversion, callback bridging, and Node-specific lifecycle handling.

## Task scope

The stable initial product architecture covers two composable AI tasks:

1. Speech-to-text through `SpeechRecognitionEngine`-shaped APIs.
2. Text generation through `TextGenerationEngine`-shaped APIs.

Speech synthesis remains an explicit strategic direction for a complete STT → text generation → TTS flow, but it is not part of the initial release gate. Phase 5 must validate it with a narrow vertical slice before fixing a public `SpeechSynthesisEngine`-shaped contract. It remains a separate task rather than an extension of recognition or generation (ADR-0009). Transcript enhancement composes the two initial tasks.

Embeddings, vision, image generation, and general tensor execution are outside the initial scope. Runtime adapters may be internally extensible, but no public abstraction is added speculatively for those tasks.

## Proposed crates

### `cuttledoc`

Owns:

- stable public Rust types;
- backend selection and capability reporting;
- engine construction and reuse;
- transcription orchestration;
- progress, cancellation, and cleanup semantics;
- stable error categories and codes.

It does not own platform FFI or JavaScript types.

### Runtime adapter crates

Own selected Apple-local inference behind task contracts:

- CoreML, Apple system Speech, and any accepted MLX/Metal/native paths;
- selected ASR model preprocessing, decoding, segmentation, and alignment;
- runtime-specific compute-unit/device configuration;
- runtime-specific thread affinity, autorelease/actor behavior, and
  deterministic cleanup;
- conversion of native results into shared domain results.

The adapters do not live in one broad `cuttledoc-apple` crate. Each accepted
foreign toolchain and ownership boundary receives a private crate, for example
`cuttledoc-coreml`, `cuttledoc-apple-speech`, `cuttledoc-mlx`, or
`cuttledoc-whisper`. This keeps Swift, Objective-C, and C++ build/link
requirements out of unrelated backends. A candidate crate enters the workspace
only after its production disposition is accepted; no crate mirrors an old npm
package or an experimental dependency.

Platform code is gated to `target_os = "macos"` and `target_arch = "aarch64"` with a macOS 26 deployment baseline (ADR-0007). Other targets expose capability absence at the orchestration layer rather than compiling Apple frameworks.

Apple SpeechAnalyzer/SpeechTranscriber has no Objective-C or C interface. It
is reached through a repository-owned Swift shim exposing a narrow C ABI to
Rust, including AssetInventory model installation for CLI and library
consumers. Official MLX is reached through a separate repository-owned,
task-level C ABI over the C++ core.

### `cuttledoc-models`

Owns logical model descriptors across three provisioning modes:

- Cuttledoc-managed artifact manifests;
- system-managed inventory/install/reservation; and
- remote provider/model identity.

For Cuttledoc-managed artifacts it owns:

- logical model ID and backend;
- upstream URL and immutable revision when available;
- expected file tree, size, and digest;
- cache layout and compatibility version;
- partial-download directory;
- validation and atomic commit;
- progress and cancellation;
- migration from existing cache locations.

Every descriptor reports supported install, verify, and remove operations.
System and remote models do not receive fake file trees merely to satisfy the
local artifact API.

The accepted initial managed set is:

- Whisper `large-v3-turbo` as one manifest spanning
  `ggml-large-v3-turbo.bin` and its complete Core ML encoder tree; and
- Gemma 4 26B-A4B 4-bit as one manifest spanning configuration, tokenizer, and
  all three safetensor shards.

Each manifest pins immutable provider revisions, exact byte lengths, and
SHA-256 digests. Installation serializes by model ID, downloads or reuses
legacy files into a unique staging tree, verifies every file, and atomically
renames only the complete tree into service. Invalid or interrupted staging
trees never masquerade as ready models. System-managed Apple Speech assets
share the descriptor vocabulary but not the local artifact implementation.

### `cuttledoc-audio`

Owns:

- media probing;
- decode to interleaved PCM;
- conversion to mono 16 kHz `f32`;
- duration calculation;
- normalization policy;
- temporary-file lifecycle;
- configured or managed FFmpeg resolution.

The compatibility-first implementation may continue invoking FFmpeg. Replacing selected audio-only formats with Rust decoders is an optimization, not a prerequisite.

The default path is deliberately conservative for the primary clean podcast
and audiobook workload. Denoising, dereverberation, source separation, and
other restoration are optional stages before recognition, not hidden behavior
inside an ASR adapter. Any such stage must preserve the original input and be
measured as part of the selected pipeline. See
[`audio-use-cases.md`](audio-use-cases.md).

### Remote provider adapters

Own pinned hosted requests and response conversion behind the same task
contracts. The implemented `cuttledoc-openrouter` slice serves only the
explicitly selected Gemini 3.6 Flash enhancement route. It receives credentials
from environment or in-memory configuration and never persists or logs them.
Provider fallback is disabled; local resource limits never activate a remote
adapter.

### `cuttledoc-cli`

Owns command parsing and terminal presentation only. Commands call the same Rust API used by bindings.

### `cuttledoc-node`

Owns:

- `napi-rs` annotations and generated TypeScript declarations;
- conversion between JS objects, buffers/typed arrays, and Rust types;
- Promise, progress callback, and cancellation bridging;
- Node-specific object finalizers.

Rust domain types are authoritative. CI regenerates or mechanically checks the
TypeScript surface and runs the same reducer contract vectors through Rust and
Node. The binding must not select backends, manage model paths independently,
or implement transcription behavior.

## Runtime model

### Engine lifecycle

Engines are explicit, reusable resources:

```text
Configured → Loading → Ready ⇄ Running → Closing → Closed
                 └──────── failure ─────────────▶ Failed
```

Rules:

- Initialization is idempotent.
- The public `Send + Sync` engine is a proxy; native state stays on an
  adapter-owned worker/actor and may remain thread-affine and non-`Send`.
- Requests enter a bounded FIFO queue. One request executes at a time unless
  the backend proves and capability-reports a higher bounded limit.
- Queue policy either waits for capacity or rejects with `ENGINE_BUSY`; no
  backend-global singleton is raced accidentally.
- One-shot calls own ephemeral contexts. Warm engine reuse requires an explicit
  `Cuttledoc` context rather than a hidden process-global cache.
- Awaited `close()` stops admission, cancels work, waits for the backend's safe
  boundary, destroys native state on its owner, and closes result streams.
  `Drop`/Node finalizers are best-effort safety nets.
- Errors preserve backend and phase context.

### Apple-local execution

The adapter worker absorbs each runtime's actual ownership:

- CoreML objects in the accepted Rust bindings are neither `Send` nor `Sync`;
  they remain on their owner and inside bounded autorelease pools. Stateful
  predictions sharing one `MLState` are serialized.
- Apple Speech remains on its Swift actor. Its blocking C entry points run on a
  blocking worker, while result callbacks are copied immediately into
  Rust-owned updates.
- The current direct Qwen/MLX adapter serializes entry and reuses explicit
  thread-crossing official MLX streams. Its synchronous graph is not preempted
  mid-evaluation; cancellation is observed after prefill or the next decoder
  step.

Future evidence may permit higher CoreML concurrency, but it widens an
execution capability rather than changing the public engine type.

### Progress, cancellation, backpressure, and shutdown

Long operations emit typed events:

- resolving model;
- downloading bytes/files;
- validating artifacts;
- decoding media;
- loading engine;
- transcribing segment;
- generating text;
- enhancing transcript.

Speech-synthesis progress events are added only after the Phase 5 vertical slice validates their meaning (ADR-0009).

Cancellation is cooperative and capability-reported. Queued work is removed
immediately. Apple Speech can cancel its actor task; synchronous MLX/native
work observes cancellation at the next chunk or decoder step. No adapter
destroys foreign state while a native call is active.

Streaming PCM uses a bounded asynchronous input writer. A successful write
transfers ownership or completes the required copy/conversion; a full queue
waits or reports explicit backpressure. It never silently drops samples.
Output consumers likewise apply normal async-stream backpressure, with a
bounded adapter-to-core queue and cancellation on abandoned streams.

Transcription results are delivered as an ordered stream of range-addressed replace/revoke updates per ADR-0008. Replacement content is volatile or final; finalized ranges are immutable. Progress events remain separate and observational.

## Apple runtime and native interop

Rust remains the owner even when foreign implementations are reused:

- Existing Parakeet Objective-C++ and Whisper C++ implementations are compatibility references and may be temporary bridges only when that is the smallest maintainable path.
- The primary MLX path uses the official C++ core through the smallest repository-owned task-level adapter. Official `mlx-c` is only an optional pinned control for a named interface/lifecycle question, not a second product path. Community bindings remain reference-only unless they pass ADR-0005.
- Specialized upstream implementations such as whisper.cpp remain candidates rather than automatic dependencies.
- Unsafe code and foreign pointers remain isolated in sys/interop modules.
- Public Rust types never expose Objective-C, C++, N-API, CoreML, MLX, Metal, or whisper.cpp handles.
- Ownership, nullability, thread affinity, error transfer, and cleanup are documented at every FFI boundary.

Current disposition:

| Component | Boundary disposition |
| --- | --- |
| CoreML through `objc2-core-ml` | Accepted bounded dependency behind a repository-owned adapter |
| Apple Speech | System framework behind a repository-owned Swift C ABI |
| Official MLX C++ | Approved upstream foundation behind a repository-owned task C ABI |
| `mlx-c` and community MLX wrappers | Reference/control only |
| whisper.cpp | Repository-owned boundary candidate pending the production bakeoff |
| Legacy Parakeet/Whisper Node addons | Compatibility and benchmark references only |
| Remote HTTP providers | Repository-owned task adapters; provider SDKs require separate acceptance |
| `napi-rs` | Accepted bounded dependency for the thin Node boundary |

The bakeoff still selects production model/backend pairs. Each selected native
boundary receives its final pin, artifact, ownership, and rollback decision
before release. See ADR-0003, ADR-0005, ADR-0006, and ADR-0010.

## Dependency acceptance

Every material runtime, wrapper, build component, and code generator is classified as an accepted production dependency, repository-owned boundary, reference-only input, or rejected project. A working spike does not bypass this review. Experimental projects may inform tests and implementation without entering Cargo/npm manifests or release artifacts. See ADR-0005.

## Model provisioning and local storage

Only `cuttledoc-managed` models use the local root:

```text
~/.cache/cuttledoc/
├── models/
│   ├── whisper-large-v3-turbo/
│   └── gemma-4-26b-a4b-it-4bit/
├── .locks/
├── .staging/
├── .backup/
└── .trash/
```

Existing roots:

- `~/.cache/parakeet-coreml/models`
- `~/.cache/parakeet-coreml/vad`
- `~/.cache/whisper-coreml/models`

The CLI's explicit install path detects complete legacy Whisper files, verifies
them against the current manifest, and hard-links or copies them into staging.
It must not redownload several gigabytes without first attempting that verified
reuse. Other legacy caches remain reference inputs until their backends are
selected for the managed product set.

The `~/.cache` root is a deliberate decision: it matches the existing
Parakeet/Whisper cache convention and keeps one path scheme across macOS and
future cloud-only targets, instead of the macOS-native `~/Library/Caches`.
System Speech models are managed by macOS through AssetInventory and never
live in this cache; remote model IDs have no local artifact entry. Capability
records may truthfully omit size, digest, quantization, or revision when the
provider does not expose them.

## Error model

Internal errors remain rich Rust enums. Public boundaries expose stable categories and codes, for example:

- `INVALID_INPUT`
- `UNSUPPORTED_PLATFORM`
- `BACKEND_UNAVAILABLE`
- `MODEL_MISSING`
- `MODEL_INVALID`
- `MODEL_DOWNLOAD_FAILED`
- `AUDIO_DECODE_FAILED`
- `ENGINE_BUSY`
- `ENGINE_CLOSED`
- `ENGINE_LOAD_FAILED`
- `BACKEND_CONTRACT_VIOLATION`
- `TRANSCRIPTION_FAILED`
- `AUTHENTICATION_FAILED`
- `CANCELLED`

Node errors include `code`, backend/model context, and the native cause when safe. CLI errors map the same codes to actionable messages and nonzero exit statuses.

## Distribution architecture

The user-facing npm contract is one package named `cuttledoc`. Implementation-only packages such as `@cuttledoc/darwin-arm64` may carry prebuilt artifacts if npm distribution requires them, but they expose no product API and are versioned automatically with the facade.

Every release tests:

1. Rust workspace from source.
2. Final native CLI archive.
3. Final npm tarball installed in an empty project.
4. ESM import.
5. CommonJS require.
6. Native addon load.
7. At least one real transcription on supported Apple Silicon infrastructure.

## Observability

The library does not log by default. It emits structured progress and diagnostic events that callers may render. Sensitive paths, credentials, and transcript content require explicit opt-in before appearing in diagnostics.

Benchmark reports record:

- Cuttledoc and model versions;
- hardware and OS;
- backend configuration;
- input fixture and duration;
- cold/warm state;
- timing and memory measurements;
- recognition metrics such as WER.
