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
| Linux x64/arm64                 |        No |    Yes |      Yes |      Yes | Cloud-only required          |
| Windows x64/arm64               |        No |    Yes |      Yes |      Yes | Cloud-only required          |

Local ASR covers the selected Apple-local backends (Parakeet, Whisper, system Speech per the bakeoff). Cuttledoc 2 remains the product for Intel Macs and macOS releases before 26.

Unsupported local inference must be represented as capability absence. Installing the general product on Linux/Windows must not fail merely because Apple-only binaries are unavailable.

## Runtime and distribution

| Surface                  | Current baseline                                      | v3 target                           | Status   |
| ------------------------ | ----------------------------------------------------- | ----------------------------------- | -------- |
| Rust library             | None                                                  | Stable `cuttledoc` crate            | New      |
| Native CLI               | Node launcher                                         | Standalone Rust binary              | Required |
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
| Automatic selection  |                           Yes |                           Yes |               Evaluate |               Yes | Required                           |
| Reusable engine      |                           Yes |                           Yes |                    Yes |    Service client | Required                           |
| Structured segments  |                           Yes |                           Yes |                    Yes |   Model-dependent | Required                           |
| Language detection   |                Model behavior |                           Yes |               Evaluate |   Model-dependent | Required where currently available |
| Confidence           |         Not currently exposed |            Segment confidence |                    Yes |   Model-dependent | Preserve where available           |
| Arbitrary media path |                Through FFmpeg |                Through FFmpeg |         Through FFmpeg |       Upload path | Required                           |
| Direct PCM input     |                   16 kHz mono |                   16 kHz mono |              Supported |       Not primary | Required for advanced API          |
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
| Result         | text, detected language, duration, segments, confidence     | Match with normalized time units                                                            |
| Warm speed     | Approximately 14× realtime on documented M1 Ultra benchmark | No more than 10% RTF regression on identical controlled hardware without accepted rationale |

Recognition gate:

- No statistically meaningful WER regression on existing Whisper/FLEURS fixtures.
- Language detection must match the baseline for the controlled multilingual set or document an upstream model/runtime reason.

## Audio compatibility

| Capability                 | Baseline                             | v3 target                                                 | Status   |
| -------------------------- | ------------------------------------ | --------------------------------------------------------- | -------- |
| Common audio/video formats | FFmpeg 8.0                           | Equivalent through managed/system FFmpeg initially        | Required |
| Sample format              | signed 16-bit PCM converted to `f32` | Equivalent numerical conversion                           | Required |
| Speech normalization       | Cuttledoc utility                    | Golden-vector parity or benchmarked replacement           | Required |
| Custom FFmpeg path         | `FFMPEG_PATH`                        | Config/environment equivalent                             | Required |
| Managed binary             | npm postinstall download             | release/first-use strategy, never implicit broken install | Redesign |
| Temporary cleanup          | Explicit helper                      | RAII cleanup, failure-tested                              | Required |

Golden audio vectors should compare sample count, duration, channel fold-down, resampling tolerance, and normalized output.

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

## CLI compatibility

Release-blocking workflows:

- transcribe a single media path;
- choose backend and language;
- choose OpenAI model and key through environment;
- write output file;
- plain text and Markdown/JSON decisions documented;
- list and download models;
- benchmark against a reference;
- meaningful version and help output;
- nonzero exit with actionable error for invalid input.

Human-readable output may change. Machine-readable JSON receives a schema version and snapshot tests.

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
