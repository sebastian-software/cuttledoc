# Cuttledoc Rust migration plan

## Objective

Deliver Cuttledoc v3 as a Rust library with a native CLI and thin Node.js bindings while preserving the useful behavior of Cuttledoc 2, `parakeet-coreml`, and `whisper-coreml`.

This is a staged migration, not a line-by-line rewrite. Each phase must produce evidence that lowers a specific risk.

## Definition of done

The incubator is ready to become Cuttledoc v3 when all of the following are true:

- The Rust API and native CLI transcribe supported audio/video inputs through at least one selected Apple-local ASR path and OpenAI on the macOS 26+ Apple Silicon baseline (ADR-0007).
- Ordered, range-addressed transcription updates with replace/revoke and volatile/final semantics (ADR-0008) are available through Rust, CLI, and Node for backends that support them; batch results are derived from the same stream model.
- The Node API covers the stable Cuttledoc 2 use cases without owning product logic.
- Public domain contracts cover speech-to-text and text generation as separate composable tasks. Speech synthesis remains an explicit product direction, but is not release-blocking until a Phase 5 vertical slice validates its contract (ADR-0009).
- Existing Parakeet and Whisper behavior has measured compatibility evidence; each capability is preserved, deliberately replaced, or explicitly deprecated with a migration path.
- Selected runtimes and bindings pass ADR-0005 rather than entering the product only because a technical spike works.
- Model downloads are resumable or atomic, validated, observable, configurable, and compatible with existing caches or an explicit migration command.
- Apple Silicon accuracy and performance stay within the agreed tolerances in `docs/compatibility-matrix.md`.
- The npm tarball installs on a clean supported machine without compiling native code.
- ESM and CommonJS can load the same prebuilt Node-API artifact.
- Rust CLI releases and npm releases are reproducible and smoke-tested from their final artifacts.
- The existing production repository has a documented upgrade, rollback, and deprecation path.

## Non-goals for the first release

- Reimplementing CoreML, whisper.cpp, or FFmpeg in pure Rust.
- Supporting Intel macOS or macOS releases before 26 at all; Cuttledoc 2 remains the product for those systems (ADR-0007).
- Capturing microphone or system audio inside the library; callers provide files or PCM feeds and own capture permissions (ADR-0008).
- Shipping every model or runtime evaluated during the Apple Silicon bakeoff.
- Supporting embeddings, vision, image generation, or arbitrary tensor execution in the initial architecture.
- Supporting every possible audio codec without an FFmpeg fallback.
- Porting embedded GGUF post-processing before its product value and distribution cost are revalidated.
- Publishing every workspace crate independently.
- Maintaining the old low-level `parakeet-coreml` and `whisper-coreml` Node APIs indefinitely.

## Phase 0 — Architecture and feasibility

**Purpose:** retire the highest-risk assumptions before scaffolding a large workspace.

Deliverables:

- Apply the third-party dependency policy and record a disposition for every runtime candidate.
- Build a task-by-runtime decision matrix for CoreML, MLX, Metal-native paths, Apple system Speech, and remote APIs.
- Define separate streaming contracts for speech recognition and text generation plus the audio input buffer/format types. Transcription updates include ordered range-based replace/revoke/final semantics per ADR-0008. Defer the speech-synthesis contract to its Phase 5 vertical slice (ADR-0009).
- Establish reproducible Apple Silicon ASR fixtures and benchmark output.
- Build a minimal CoreML interop spike from Rust on `darwin-arm64`.
- Build a time-boxed meaningful MLX inference spike from Rust through a narrow repository-owned C++ adapter over official `ml-explore/mlx`. Keep official `mlx-c` as an optional pinned control for named interface/lifecycle questions; community wrappers remain reference-only unless they pass ADR-0005.
- Exercise Apple SpeechAnalyzer/SpeechTranscriber as a full bakeoff candidate through a repository-owned Swift shim, including AssetInventory model installation and executable-identity behavior from a CLI context (ADR-0007).
- Re-evaluate current ASR candidates against the existing Parakeet and Whisper baselines.
- Decide the first selected local ASR model/runtime and its repository-owned or external interop boundary.
- Evaluate the local LLM runtime separately from ASR.
- Prove a `napi-rs` addon can load from both ESM and CommonJS.
- Pack and install a minimal npm tarball in an empty directory.
- Record recognition quality, binary/model size, startup and first-result latency, model load time, memory, energy procedure, and cleanup behavior.

Exit criteria:

- A real CoreML model is loaded and invoked from a Rust-owned lifecycle.
- A meaningful MLX path is exercised from Rust or rejected with a precise technical blocker.
- CoreML, MLX, and Apple system Speech have comparable evidence or a recorded reason comparison is impossible.
- The selected production path passes the dependency policy; reference-only projects are not present in product manifests or release builds.
- The result crosses Rust → Node without a second orchestration layer.
- The packed addon loads on Node 22 and Node 24 without `node-gyp`.
- Interop ownership and thread-affinity rules are documented.

### Current Phase 0 status

Evidence snapshot: 2026-07-24.

| Workstream | State | Remaining gate |
| --- | --- | --- |
| Dependency policy and runtime matrix (#10, #2) | Complete | Apply the accepted policy to each newly selected production pin. |
| Capability-oriented API and ownership (#8) | Complete | Check the provisional types against the first real vertical slice. |
| MLX prior-art audit (#3) | Complete by disposition | Community bindings and `mlx-node` remain reference-only; official MLX through repository-owned task adapters is the selected foundation. Reproducing the obsolete Node-owned packaging path has no remaining decision value. |
| CoreML feasibility (#5) | Foundation proven | The real-model lifecycle goal is complete. Productization gaps are deferred until a selected backend needs Core ML rather than keeping the feasibility issue open indefinitely. |
| Apple Speech feasibility (#11) | Foundation proven | The multilingual benchmark is complete; shipped executable identity, clean-host cold start, and energy remain productization evidence. |
| Official MLX feasibility (#6) | Complete | The official C++ core, owned C ABI, two-release upgrade, packaging, and repeated encoder lifecycle are proven. |
| End-to-end MLX ASR (#15) | Complete | The common-schema record now contains quality, lifecycle, timing, memory, model, and artifact evidence. Broader languages and product behavior move to #4, #12, and the selected vertical slice. |
| Mandatory ASR benchmark (#4) | Complete | Ten multilingual fixtures select Apple SpeechTranscriber as the first vertical-slice backend and Whisper large-v3-turbo as an opt-in fallback. Energy, clean-host cold start, and statistical scale remain release-threshold follow-ups. |
| Exploratory ASR sweep (#12) | Complete | Qwen3-ASR advanced to the owned adapter in #17. The later Voxtral Realtime refresh replaces its stale vLLM-only blocker with pinned Apple-local MLX measurements and a bounded repository-owned live session; held-out, long-audio, and product-integration gates remain. |
| Direct Qwen3-ASR over official MLX (#17) | Complete | The owned adapter reaches exact fixed-fixture parity, completes the 15-fixture multilingual audiobook pilot, and proves reusable Rust lifecycle plus stable invalid, busy, and cancelled states. Held-out target-domain data, common-engine integration, and release pruning are follow-ups. |
| Held-out target-domain corpus (#18) | Complete | Three CC-BY-4.0 German podcast episodes are frozen as exact ten-minute validation/test passages with five speakers and digest-pinned source, publisher-draft, and PCM artifacts. The validation review bundle and five complete-coverage, unscored Apple/Whisper/Qwen/Parakeet/Voxtral drafts are committed. Independent review remains available for later release-quality claims but is no longer an implementation-selection gate. |
| Voxtral Realtime live streaming (#19) | Complete | The repository-owned official-MLX session retains incremental mel, causal-convolution, 32-layer encoder, downsampler, 26-layer decoder, token, and text state behind the bounded Rust/C ABI. Real-time 480/2,400 ms runs reproduce the pinned 177-token streaming text exactly with append-only deltas; a ten-run DE/EN/ES/FR/PT control preserves language/delay cells and confirms 320 ms input as the stable path. The pure-C/MPS control proves a tiny binary but a larger BF16 model/working set, missing lifecycle semantics, and an ADR-0005 failure; ADR-0012 selects the owned official-MLX boundary. Held-out data moves to #18; common-engine, long-audio, and clean-host delivery are focused productization follow-ups. |
| Synthetic TTS roundtrip (#13) | Deferred, non-blocking | The required Apple, Qwen VoiceDesign, and Voxtral BF16 factorial evidence is complete. A public synthesis contract and product backend remain later work and do not block Phase 1 or the first transcription release. |
| Thin Node/npm boundary (#9) | Complete | Node 22/24 CI builds, packs, compiler-free installs, and tests the same macOS arm64 tarball through ESM and CommonJS, including streaming fields, background work, progress, errors, cancellation, and missing-artifact diagnostics. |
| Local text-generation runtime (#7) | Complete | The pinned Qwen3 0.6B MLX reference proves load, deterministic streaming, cancellation, and external lexical rejection. It is explicitly a runtime/negative control, not quality selection. |
| Transcript-enhancement model/runtime bakeoff (#20) | Complete | ADR-0014 selects Gemma 4 26B-A4B 4-bit as the local-first model and Gemini 3.6 Flash as the explicit OpenRouter quality option. The raw transcript remains available, smaller local models are rejected, 32 GB unified memory is recommended, and official MLX is the first embedded implementation path. |

Phase 0 is complete. Remaining clean-host, energy, held-out, and backend-specific
measurements are productization or release-threshold follow-ups. They do not
justify keeping successful feasibility spikes open or delaying the Phase 1
workspace.

## Phase 1 — Workspace foundation

**Purpose:** create only the structure justified by the spike.

### Current checkpoint

The initial workspace now contains the public `cuttledoc` domain contracts,
model identity/provisioning types, native CLI, thin Node-API binding, and the
private Apple Speech platform boundary. The proven transcription-update
vectors have moved from spike-only evidence into product tests. Linux verifies
the portable workspace; macOS 26 arm64 verifies the selected Apple boundary.
The adapter truthfully remains unavailable until the Phase 2 Swift
implementation is linked.

Deliverables:

- Cargo workspace and pinned stable Rust toolchain.
- `cuttledoc`, `cuttledoc-models`, `cuttledoc-cli`, and `cuttledoc-node` starting crates plus only the runtime adapter crates justified by Phase 0.
- Formatting, Clippy, unit tests, dependency auditing, license checks, and macOS CI.
- Shared error model with stable error codes.
- Shared progress-event and cancellation types.
- Initial fixture import with provenance metadata.
- Artifact-oriented smoke-test harness.

Exit criteria:

- The empty vertical architecture builds locally and in CI.
- Platform-specific code does not prevent non-macOS crates from compiling.
- Rust and Node APIs are generated or checked from one set of domain types.

## Phase 2 — Selected local ASR vertical slice

**Purpose:** validate the complete product path with the best Apple-local foundation selected by the Phase 0 bakeoff.

### Current checkpoint

The private Apple Speech crate now builds its repository-owned Swift C ABI as a
static archive on macOS 26 arm64 and exposes a safe Rust-owned session
lifecycle. The final binary uses Apple's system Swift runtime and needs no
separate adapter library. Restricted process sandboxes expose an empty Speech
locale inventory for both static and dynamic forms; the same static binary
works with normal macOS system-service access.

The first real product-adapter smoke streamed the pinned 10.56-second FLEURS
PCM fixture through Rust, reproduced the spike's 27 volatile replacements plus
one final update, and retained all 19 final time/confidence segments. The same
fixture now also completes through the public `cuttledoc::transcribe_pcm` path
and returns the resolved locale, exact media duration, final text, final segment
range, and all 19 word ranges/confidence values in `TranscriptionResult`.

The product mapping preserves Apple's narrower final speech range while
expanding only the technical affected range needed to replace the preceding
whole-audio volatile hypothesis. This keeps native timing evidence intact and
passes every update through the shared reducer contract. A separate cancel path
joined and destroyed the native session cleanly. These system-service smokes
must run outside restricted sandboxes; unit and callback contract tests remain
hermetic.

The adapter now also reports supported, installed, and reserved locales plus
the system reservation limit through a typed C callback. Public recognition
capabilities derive their availability, language identifiers, and locale list
from that live inventory instead of treating every matching build as usable.
Restricted test sandboxes therefore report `system_asset_unavailable`, while a
normal host process reports the installed Apple Speech inventory.

The native CLI now accepts validated mono little-endian `f32` PCM, an explicit
BCP 47 language tag, and an optional sample rate. The pinned FLEURS fixture
completes through this command and prints the same final text as the Phase 0
oracle. General media decoding remains deliberately outside this slice. The
next slice crosses the thin Node boundary.

Scope:

- Selected model and runtime lifecycle with immutable model revision.
- Required preprocessing, decoding, VAD/segmentation, vocabulary/tokenizer, and alignment behavior.
- Ordered, range-addressed transcription updates with replace/revoke and volatile/final semantics per ADR-0008; bounded chunking where the selected model requires it.
- Language, timestamps, confidence, and word-level capabilities according to the selected contract.
- Structured segments and combined text.
- Engine reuse and deterministic cleanup.
- Model download, validation, force refresh, and progress.
- Rust, CLI, and Node surfaces.

Exit criteria:

- Existing fixtures pass agreed quality and timestamp tolerances against the Phase 0 baseline.
- Long audio is handled without exposing internal model constraints.
- A packed npm artifact performs a real transcription on Apple Silicon.
- Repeated engine creation and disposal does not leak materially.

## Phase 3 — Compatibility backend and coverage

**Purpose:** add the second backend or compatibility path justified by gaps in the first vertical slice.

Scope:

- Preserve or deliberately replace the valuable Whisper `large-v3-turbo` baseline capabilities.
- Pin the selected model, runtime, conversion, and native upstream revisions reproducibly.
- Automatic language detection and explicit language selection.
- Segment timestamps and confidence.
- Broader language or runtime coverage missing from the first vertical slice.
- Model downloads, validation, progress, and atomic installation.

Exit criteria:

- Existing Whisper fixtures pass agreed text, language, and timestamp tolerances or an accepted compatibility report explains the replacement.
- Model updates are pinned and reproducible rather than implicitly “latest.”
- Node and CLI artifacts load without bundler-specific native-addon workarounds.

## Phase 4 — Audio, OpenAI, and orchestration parity

**Purpose:** make the Rust core a usable replacement for Cuttledoc 2.

Scope:

- Audio/video probing and decode to normalized 16 kHz mono `f32` samples.
- Initial compatibility path through a managed FFmpeg binary or configured system binary.
- Backend selection: explicit backend and `auto` behavior.
- OpenAI transcription models and API-key handling.
- Backend capability reporting.
- Engine caching and cleanup.
- CLI transcription, output paths, plain text, Markdown, and model commands.
- Cancellation and progress propagation across downloads, decode, load, and inference.

Exit criteria:

- Current CLI happy paths are covered by artifact tests.
- Linux and Windows can build the non-CoreML product and use OpenAI.
- Credentials never appear in command lines, logs, or persisted configuration.

## Phase 5 — Text generation and speech synthesis decisions (#13)

**Purpose:** prevent the existing `@cuttledoc/llm` implementation from silently defining the Rust architecture and evaluate the strategic STT → LLM → TTS direction without making it a blocker for the first v3 release (ADR-0009).

Evaluate independently:

- OpenAI enhancement through the Rust core.
- Ollama enhancement through the Rust core.
- Embedded GGUF inference and its binary/model distribution cost.
- MLX, `mistral.rs`, Candle, and a narrow llama.cpp/GGUF path where they pass the dependency gate.
- Chunking, correction statistics, Markdown formatting, and prompt compatibility.
- Whether enhancement belongs in the initial v3 or a later minor release.
- Candidate local and remote TTS runtimes/models for Apple Silicon.
- Start with Apple `AVSpeechSynthesizer`, Qwen3-TTS 0.6B CustomVoice, Voxtral TTS, and Chatterbox through a pinned MLX-Audio reference, plus Qwen-Audio-3.0-TTS-Plus as an English remote quality ceiling. Treat MLX-Audio as a serious implementation candidate and decide between retaining it and a narrow direct official-MLX adapter only after measurements.
- Run the separate German-first synthetic TTS → STT diagnostic defined in `benchmarks/fixtures/synthetic-roundtrip-plan.json`. It may validate integration and diagnose pronunciation/recognition errors, but it cannot replace real podcast/audiobook evidence or select the production ASR backend.
- Voice/language selection, streaming audio chunks, sample formats, and synthesis cancellation.
- Build one narrow TTS vertical slice before fixing a public synthesis contract; validate output ownership, audio chunking, backpressure, cancellation, and lifecycle against a real runtime.
- Decide whether a TTS implementation belongs in a later v3 minor release. Promoting TTS into a release gate requires a follow-up ADR with implementation evidence.

Gate:

- Issue #7 proves the runtime and safety-gate foundation. Issue #20 and
  ADR-0014 select Gemma 4 26B-A4B 4-bit as the local model and Gemini 3.6 Flash
  as the explicit hosted option. Implement Gemma first through a narrow owned
  adapter over official MLX after the common text-generation and enhancement
  contracts exist. A Core ML conversion is triggered only by a material MLX
  memory, parity, energy, lifecycle, or packaging problem.
- Keep enhancement only where measured transcript quality, install size, and operational complexity justify it.
- Do not select an immature runtime merely because its model experiment succeeds.
- Preserve raw transcription as a complete product regardless of this decision.
- Keep speech synthesis independently usable rather than coupling it to one LLM or voice-assistant flow.
- Do not treat speech synthesis as part of the first v3 definition of done unless a later accepted ADR explicitly promotes it.

## Phase 6 — Distribution and compatibility

**Purpose:** prove that the final delivery mechanisms work, not just source checkouts.

Deliverables:

- Rust crate publication plan.
- Native CLI archives, checksums, signatures, Apple notarization, and Homebrew path.
- One user-facing `cuttledoc` npm package.
- Platform-specific npm binary packages only if required as hidden distribution details.
- Node 22/24 test matrix for ESM and CommonJS.
- macOS deployment-target and Apple Silicon test matrix.
- Linux/Windows cloud-only artifact tests.
- SBOM, license inventory, provenance, and release attestations.
- Clean-machine install tests from packed/published artifacts.

Exit criteria:

- Installation never invokes Rust, CMake, Xcode, or `node-gyp` on a supported target.
- Unsupported targets fail with a deliberate capability message, not npm platform-resolution noise.
- A release can be reproduced from a tag.

## Phase 7 — Product migration

**Purpose:** make the Rust implementation Cuttledoc rather than a permanent side project.

Deliverables:

- Final compatibility report and benchmark comparison.
- Cuttledoc 2 → 3 migration guide.
- Cache migration or reuse behavior.
- Deprecation notices for `parakeet-coreml` and `whisper-coreml`.
- Plan for `@cuttledoc/ffmpeg` and `@cuttledoc/llm`.
- Import or merge strategy into `sebastian-software/cuttledoc`.
- Release candidate, rollback plan, and support window.

Exit criteria:

- Cuttledoc v3 is released from the product repository.
- Legacy repositories clearly point to their replacements.
- No model or package is archived before users have a working migration path.

## Cross-cutting workstreams

### Testing

- Unit tests for pure Rust transformations and state machines.
- Contract tests shared across backends.
- Real-model integration tests on self-hosted Apple Silicon runners.
- FLEURS-based regression fixtures already used by Cuttledoc.
- Packed npm tests, installed CLI tests, and crate consumer tests.
- Failure injection for partial downloads, corrupted caches, cancellations, and unavailable hardware.

### Performance

Track separately:

- decode time;
- model download and validation time;
- cold and warm model load time;
- inference real-time factor;
- peak/resident memory;
- first-result latency;
- native binary and npm install size.

Performance comparisons must use the same machines, fixtures, model versions, and power conditions.

### Security and supply chain

- Apply ADR-0005 to runtime, build-time, code-generation, and transitive production dependencies.
- Pin model manifests with source, revision, expected files, sizes, and digests.
- Write downloads to temporary paths and commit atomically after validation.
- Avoid arbitrary lifecycle downloads during package installation.
- Audit vendored native code and generated bindings.
- Keep API keys in environment variables or explicit in-memory options.

## Main risks

| Risk                                                                             | Impact                               | First mitigation                                        |
| -------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| CoreML ownership or thread affinity is incompatible with generic async executors | Crashes or nondeterministic behavior | Phase 0 single-thread executor spike                    |
| Direct Rust CoreML coverage is incomplete                                        | Large unsafe surface or stalled port | Stage through a narrow C ABI and replace incrementally  |
| whisper.cpp build and linking dominate complexity                                | Fragile releases                     | Isolated sys crate, pinned upstream, artifact test      |
| npm platform packaging recreates current install failures                        | Users cannot install                 | Pack/install matrix before backend porting expands      |
| Model downloads are huge and currently weakly verified                           | Corruption and poor UX               | Versioned manifests, hashes, atomic/resumable downloads |
| “One package” grows too large through embedded LLM inference                     | Slow installs and maintenance burden | Decide enhancement separately in Phase 5                |
| Rewrite changes recognition quality unnoticed                                    | Product regression                   | Golden fixtures and benchmark gates from Phase 1        |
| Incubator and production diverge                                                 | Duplicate maintenance                | Time-box phases and migrate into product repo at parity |
| A promising but weakly maintained wrapper becomes critical infrastructure       | Forced fork or blocked upgrades      | ADR-0005 disposition before adoption                    |
| macOS 26+ baseline excludes users on older macOS                                 | Lost or stranded users               | Keep Cuttledoc 2 supported with an explicit window (ADR-0007) |

## Immediate next actions

1. Close the completed or superseded Phase 0 issues with links to their
   evidence, then close the Phase 0 epic.
2. Scaffold the Phase 1 Cargo workspace with only the common product crates and
   the Apple Speech adapter selected by ADR-0015.
3. Establish formatting, Clippy, unit-test, dependency-policy, and macOS CI
   gates around the empty vertical architecture.
4. Build the first real Apple Speech transcription path through Rust, CLI, and
   the packed Node artifact before adding the Whisper fallback.
5. Add transcript enhancement after the common `TextGenerationEngine` and raw
   transcription result paths exist: Gemma locally on capable machines and
   Gemini only through explicit OpenRouter configuration.
