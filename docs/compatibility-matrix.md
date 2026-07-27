# Compatibility matrix and quality gates

## Purpose

The migration is complete when users can replace Cuttledoc 2 with Cuttledoc 3 for supported workflows, not when an equivalent number of source files has been written in Rust.

Status values:

- **Required:** release-blocking compatibility.
- **Evaluate:** retain only after product/technical validation.
- **New:** intentional improvement rather than legacy parity.

## Platforms

| Platform                        | Local ASR | OpenAI | Rust CLI | Node API | Status                       |
| ------------------------------- | --------: | -----: | -------: | -------: | ---------------------------- |
| macOS Apple Silicon (macOS 26+) |       Yes |    Yes |      Yes |      Yes | Required                     |
| macOS Intel / macOS < 26        |        No |     No |       No |       No | Dropped in v3 (ADR-0007)     |
| Linux x64                       |        No |    Yes |      Yes |      Yes | Cloud-only artifacts implemented |
| Linux arm64                     |        No |    Yes |      Yes |      Yes | Cloud-only artifact required |
| Windows x64                     |        No |    Yes |      Yes |      Yes | Cloud-only artifacts implemented |
| Windows arm64                   |        No |    Yes |      Yes |      Yes | Cloud-only artifact required |

Local ASR covers the selected Apple-local backends (Parakeet, Whisper, system Speech per the bakeoff). Cuttledoc 2 remains the product for Intel Macs and macOS releases before 26.

Unsupported local inference must be represented as capability absence. Installing the general product on Linux/Windows must not fail merely because Apple-only binaries are unavailable.

## Runtime and distribution

| Surface                  | Current baseline                                      | v3 target                           | Status   |
| ------------------------ | ----------------------------------------------------- | ----------------------------------- | -------- |
| Rust library             | None                                                  | Stable `cuttledoc` crate            | New      |
| Native CLI               | Node launcher                                         | Standalone Rust binary; macOS arm64 archive implemented | Required |
| Node versions            | 22+ in Cuttledoc; 20+ in native packages              | Node 22 and 24 initially            | Required |
| Node ESM                 | Advertised, native packages currently broken          | Packed-artifact import test         | Required |
| Node CommonJS            | Supported                                             | Packed-artifact require test        | Required |
| Native build at install  | Current packages accidentally invoke `node-gyp`       | Never on supported targets          | Required |
| Package surface          | Three public product packages plus workspace packages | One user-facing `cuttledoc` package | Required |
| Rust toolchain for users | N/A                                                   | Not required for binaries/npm       | Required |

## Backend behavior

| Capability           |                      Parakeet |                       Whisper |          Apple Speech |            OpenAI | Status                             |
| -------------------- | ----------------------------: | ----------------------------: | ---------------------: | ----------------: | ---------------------------------- |
| Explicit selection   |                           Yes |                           Yes |                    Yes |               Yes | Required                           |
| Automatic selection  |                           Yes |                           Yes |               Evaluate | No (explicit only) | Required                           |
| Reusable engine      |                           Yes |                           Yes |                    Yes |    Service client | Required                           |
| Structured segments  |                           Yes |                           Yes |                    Yes |   Model-dependent | Required                           |
| Language detection   |                Model behavior |                           Yes |               Evaluate |   Model-dependent | Required where currently available |
| Confidence           |         Not currently exposed | Legacy constant deliberately omitted |                    Yes |   Model-dependent | Preserve only measured confidence  |
| Arbitrary media path |                Through FFmpeg |                Through FFmpeg |         Through FFmpeg |       Upload path | Required                           |
| Direct PCM input     |                   16 kHz mono |                   16 kHz mono |              Supported |     No (file only) | Required for advanced local API    |
| Cancellation         |                       Limited |                       Limited |                    Yes | HTTP cancellation | New                                |
| Structured progress  | Download callbacks/CLI output | Download callbacks/CLI output |                    New |           Limited | New unified API                    |
| Streaming results    |  Final segments (VAD-chunked) |       Final segments (chunks) |       Volatile + final |   Model-dependent | New, capability-gated (ADR-0008)   |

The Apple Speech column corresponds to the provisional `AppleSpeech` /
`"apple-speech"` backend identifier. The repository-owned Swift C ABI has
proven real streamed recognition, asset lifecycle, cancellation, word timing,
confidence, and volatile-to-final replacement on macOS 26. It remains a
bakeoff candidate under ADR-0006/0007 rather than a legacy parity obligation.

Streaming contract tests reduce ordered, range-addressed replace/revoke updates
into a transcript. They must cover volatile replacement, synthetic revocation,
finalization, overlap rejection for finalized ranges, and identical Rust/Node
results. Spike #11 observed no replacement-free Apple Speech revocation in the
tested real stream; synthetic `Revoke` remains part of the backend-independent
contract (ADR-0008).

## Parakeet gates

| Behavior           | Baseline                                                    | v3 gate                                                                                     |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Model              | Parakeet TDT 0.6B v3                                        | Same initial model and artifact revision                                                    |
| Languages          | 25 European languages                                       | Capability metadata matches                                                                 |
| Input              | 16 kHz mono `f32`                                           | Same plus validated metadata                                                                |
| Fixed model window | 15 seconds                                                  | Remains internal                                                                            |
| VAD                | Always-on Silero CoreML                                     | Equivalent segmentation semantics                                                           |
| VAD frame          | 576 samples / 36 ms                                         | Match unless benchmarked change is accepted                                                 |
| Threshold          | 0.5 default                                                 | Match                                                                                       |
| Minimum silence    | 300 ms default                                              | Match                                                                                       |
| Minimum speech     | 250 ms default                                              | Match                                                                                       |
| Result             | text, duration, segments in seconds                         | Equivalent text/segments with normalized domain time                                        |
| Warm speed         | Approximately 40× realtime on documented M1 Ultra benchmark | No more than 10% RTF regression on identical controlled hardware without accepted rationale |

Recognition gate:

- No statistically meaningful WER regression on the existing supported-language fixture set.
- Segment boundaries allow a documented tolerance because VAD and scheduling can vary; text association must remain correct.

## Whisper gates

| Behavior       | Baseline                                                    | v3 gate                                                                                     |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Model          | `large-v3-turbo`                                            | Same initial model                                                                          |
| whisper.cpp    | `v1.8.2`                                                    | Start at baseline; updates require explicit comparison                                      |
| Languages      | 99-language metadata                                        | Match                                                                                       |
| Language       | Explicit or `auto`                                          | Match                                                                                       |
| Encoder        | CoreML/ANE                                                  | Match                                                                                       |
| Decoder        | whisper.cpp via Metal/CPU                                   | Match                                                                                       |
| Required files | GGML plus CoreML encoder                                    | Manifest requires both                                                                      |
| Result         | text, detected language, duration, segments, constant confidence | Match text/language/ranges; omit the unmeasured confidence constant                     |
| Warm speed     | Approximately 14× realtime on documented M1 Ultra benchmark | No more than 10% RTF regression on identical controlled hardware without accepted rationale |

Recognition gate:

- No statistically meaningful WER regression on existing Whisper/FLEURS fixtures.
- Language detection must match the baseline for the controlled multilingual set or document an upstream model/runtime reason.

### Rust product checkpoint

The issue #24 checkpoint at `18b3153` completes the product boundary:

- explicit `whisper` and local-only `auto` selection are shared by Rust, CLI,
  ESM, and CommonJS;
- the pinned FLEURS fixture reproduces the exact legacy hypothesis,
  auto-detected `en`, and the normalized `0..10560 ms` segment;
- explicit BCP-47 language input is reduced to the Whisper language identifier;
- stable missing/invalid-model, source-unavailable, engine-load, transcription,
  contract, and cancellation errors replace native implementation leakage;
- cancellation is cooperative at decoder steps; Core ML model/plan loading is
  a documented non-cancellable boundary;
- three complete create/transcribe/dispose repetitions returned identical
  results with 1,963,130,880 bytes maximum RSS;
- the release Node-API library is 2,781,280 bytes and the compiler-free npm
  tarball is 1,007,607 bytes. The tarball transcribes with both Apple Speech and
  Whisper through ESM and CommonJS and covers active Whisper cancellation.

This proves compatibility behavior, not the final release-performance claim.
The product port's observed warm one-shot process was about 1.65 seconds for
10.56 seconds of audio, but the old 657.6 ms measurement isolated repeated
inference on an already loaded context. A like-for-like reusable-engine timing,
energy measurement, and the statistical release corpus remain release-threshold
work rather than blockers for the ownership port. Full model provisioning is
owned by #27. See
`benchmarks/runs/whisper-rust-product.fleurs-en-000.json`.

## Audio compatibility

| Capability                 | Baseline                             | v3 target                                                 | Status   |
| -------------------------- | ------------------------------------ | --------------------------------------------------------- | -------- |
| Common audio/video formats | FFmpeg 8.0                           | Owned external-process FFmpeg path; managed binary pending | In progress |
| Sample format              | signed 16-bit PCM converted to `f32` | Equivalent numerical conversion                           | Required |
| Speech normalization       | Cuttledoc utility                    | Conservative unfiltered default; optional profiles measured separately | Deliberate replacement |
| Custom FFmpeg path         | `FFMPEG_PATH`                        | Explicit API/CLI path, then environment, then process `PATH` | Implemented |
| Managed binary             | npm postinstall download             | release/first-use strategy, never implicit broken install | Redesign |
| Temporary cleanup          | Explicit helper                      | Direct stdout stream; child cleanup is failure-tested     | Implemented |

Golden audio vectors should compare sample count, duration, channel fold-down, resampling tolerance, and normalized output.

The first long-form memory control decodes a continuously re-encoded one-hour
Ogg/Opus input to exactly 230.4 MB of mono 16 kHz `f32` PCM in 5.6 seconds. The
current complete-buffer handoff peaks at 471.5 MB RSS. This keeps a one-hour
file practical on the 16 GB baseline while preserving chunked decoding as the
review trigger for multi-hour inputs rather than an unmeasured release blocker.

## Model management

| Capability           | Baseline                       | v3 target                                | Status   |
| -------------------- | ------------------------------ | ---------------------------------------- | -------- |
| Lazy download        | Yes                            | Yes                                      | Required |
| CLI predownload      | Yes                            | Yes                                      | Required |
| Custom model root    | Yes                            | Yes                                      | Required |
| Completeness checks  | File existence                 | Versioned manifest and digest validation | New      |
| Progress             | Inconsistent callbacks/console | Typed events without library logging     | New      |
| Atomic installation  | Partial                        | Temporary path plus verified commit      | New      |
| Resume               | No                             | Evaluate per host support                | Evaluate |
| Existing cache reuse | Separate roots                 | Detect and migrate/reuse deliberately    | Required |
| Removal/verification | Limited                        | First-class API and CLI                  | New      |
| System-managed Speech assets | N/A                    | AssetInventory install/status surfaced through model API | New      |

The Phase 4 checkpoint implements the two accepted Cuttledoc-managed
snapshots: Whisper `large-v3-turbo` (2.90 GB) and Gemma 4 26B-A4B 4-bit
(15.37 GB). Their immutable manifests pin every artifact URL, byte size, and
SHA-256 digest. Installation uses a per-model lock, verified staging tree, and
atomic rename; replacement and removal first detach the previous tree.
`missing`, `partial`, `ready`, and `invalid` are observable without mutating
the cache. Explicit installation can reuse the legacy Whisper cache after full
manifest verification. Apple Speech is listed as a system-managed asset and
does not pretend to support file install, verification, or removal.

## CLI compatibility

Implemented Phase 4 workflows:

- transcribe a single media path;
- choose backend and language;
- choose a managed model or an explicit artifact path;
- explicitly select hosted OpenAI file transcription and its model/timeout;
- choose local Gemma or explicit hosted Gemini enhancement;
- write text, Markdown, or schema-versioned JSON to stdout or a safe output
  file;
- list, install, verify, remove, and locate managed models;
- inspect Apple system assets through the same model vocabulary;
- meaningful version and help output;
- typed progress on stderr;
- stable nonzero errors with remediation for invalid input and unsupported
  operations.

Reference benchmarking, directory batching, and `doctor` are separate future
work, not hidden dependencies of the single-file replacement. Human-readable
output may change. Machine-readable JSON has schema version `1.0.0` and
snapshot tests; raw and enhanced/fallback text remain distinct.

## Hosted transcription

The `openai-transcription` backend is implemented behind a private portable
Hyper/Rustls adapter. It accepts only explicit file requests, uploads the
original supported media without FFmpeg, and is never considered by `auto`.
Rust and Node accept an ephemeral in-memory credential or `OPENAI_API_KEY`; the
CLI reads only `OPENAI_API_KEY` and exposes no key argument.

The fixed initial model set is `gpt-4o-transcribe`,
`gpt-4o-mini-transcribe`, and `whisper-1`. Uploads are bounded to 25 MB.
GPT-model results do not invent timestamps or media duration; `whisper-1` maps
provider-reported duration and segments. Hermetic contract tests cover request
shape, response mapping, provider errors, timeout, active cancellation, body
bounds, and credential redaction.

## Transcript enhancement

| Capability              | Baseline                | v3 decision                                                   |
| ----------------------- | ----------------------- | ------------------------------------------------------------- |
| Raw transcription       | Always available        | Required and always retained                                  |
| Correction mode         | Default CLI enhancement | Local Gemma on capable machines; off when memory is insufficient |
| Local model             | Ollama-managed models   | Gemma 4 26B-A4B 4-bit over official MLX; 32 GB recommended   |
| Hosted enhancement      | OpenAI                  | Gemini 3.6 Flash through explicit OpenRouter configuration    |
| Hosted fallback         | Provider-dependent      | Never automatic; local resource limits retain the raw text    |
| Markdown formatting     | Supported               | Preserve above the provider-neutral generation engine         |
| Ollama                  | Supported               | Optional future provider, not an initial v3 implementation    |
| Embedded GGUF           | `node-llama-cpp`        | Defer unless cross-platform distribution justifies the cost   |
| Chunking and statistics | Supported               | Preserve in the enhancement orchestrator                      |

ADR-0014 records the local-first decision. Enhancement remains separable from
raw transcription and does not delay a complete transcription product. The
selected synthetic development results guide the implementation but are not a
universal podcast or audiobook accuracy claim.

## Artifact test matrix

Every release candidate must test the final artifacts rather than workspace links:

| Test                        |       macOS arm64 |          Linux x64 |        Windows x64 |
| --------------------------- | ----------------: | -----------------: | -----------------: |
| Rust unit/contract tests    |               Yes | Yes where portable | Yes where portable |
| Native CLI `--version`      |               Yes |                Yes |                Yes |
| npm install from tarball    |               Yes |                Yes |                Yes |
| ESM import                  |               Yes |                Yes |                Yes |
| CommonJS require            |               Yes |                Yes |                Yes |
| Capability discovery        |               Yes |                Yes |                Yes |
| Real Parakeet transcription |               Yes |                N/A |                N/A |
| Real Whisper transcription  |               Yes |                N/A |                N/A |
| Real system Speech transcription | Yes (macOS 26 runner) |          N/A |                N/A |
| OpenAI contract test        | Mocked/live-gated |  Mocked/live-gated |  Mocked/live-gated |
| No local compiler invoked   |               Yes |                Yes |                Yes |

The current standalone CLI archive is implemented and artifact-tested for
macOS arm64. Its test extracts the final 41.8 MB archive and exercises success
and stable failure paths with Cargo, Rust, C/C++, CMake, and Xcode build
commands blocked. A real local checkpoint additionally transcribed the same
German Opus fixture through both Apple Speech and the packaged Whisper runtime.

The cloud-only matrix passed on Linux x64 and Windows x64 at commit `0786192`
in [CI run 30275880627](https://github.com/sebastian-software/cuttledoc-rs/actions/runs/30275880627).
Both final archives installed and exercised CLI plus ESM/CommonJS Node
preflight with compiler lifecycles blocked. The Linux archives measured
1,768,205 bytes (CLI) and 1,814,029 bytes (Node); Windows measured 1,416,434
bytes (CLI) and 1,461,203 bytes (Node). They contain no Apple framework,
Whisper, Gemma/MLX, model, or FFmpeg artifact. Linux arm64 and Windows arm64
remain future artifact targets.

## Release evidence

A release candidate report must include:

- source commit and artifact digests;
- dependency and model manifest revisions;
- test matrix results;
- benchmark hardware/OS;
- cold/warm load and inference metrics;
- WER comparison;
- memory comparison;
- npm and CLI install sizes;
- known compatibility deviations and their acceptance decision.
