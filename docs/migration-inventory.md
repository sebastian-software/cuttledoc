# Migration inventory

## Source baselines

This inventory was created from clean checkouts on 2026-07-16.

| Repository                                                                 | Version | Baseline commit                            | Role                                                |
| -------------------------------------------------------------------------- | ------- | ------------------------------------------ | --------------------------------------------------- |
| [`cuttledoc`](https://github.com/sebastian-software/cuttledoc)             | 2.0.0   | `e0c587883f1fdf67d521f8e0b3c216b22d91fda6` | Product API, CLI, audio, cloud, LLM, docs, fixtures |
| [`parakeet-coreml`](https://github.com/sebastian-software/parakeet-coreml) | 2.2.0   | `3a29d6f80bfa5f95e791d21cfa86a0154806ef47` | Parakeet TDT CoreML engine and Silero VAD           |
| [`whisper-coreml`](https://github.com/sebastian-software/whisper-coreml)   | 1.1.0   | `20f619e02b46e64dc819958d3ab83bd029607f0a` | whisper.cpp/CoreML engine                           |

The inventory is a migration aid, not a claim that every line should be ported. Source behavior is classified as preserve, redesign, defer, or retire.

## Product-level inventory

| Current capability             | Current location                       | Target                          | Disposition                                      |
| ------------------------------ | -------------------------------------- | ------------------------------- | ------------------------------------------------ |
| `transcribe(path, options)`    | `packages/cuttledoc/src/index.ts`      | `cuttledoc` crate plus adapters | Preserve and make primary                        |
| Backend selection and `auto`   | `backend.ts`, `index.ts`               | `cuttledoc`                     | Preserve with explicit capability reasons        |
| Backend instance caching       | `index.ts`                             | `Cuttledoc` context             | Redesign without process-global accidental state |
| Structured result and segments | `types.ts`                             | shared Rust domain types        | Preserve; normalize timestamp units              |
| Model download/status          | Cuttledoc plus both native packages    | `cuttledoc-models`              | Consolidate and harden                           |
| CLI transcription              | `packages/cuttledoc/src/cli`           | `cuttledoc-cli`                 | Preserve behavior and improve machine output     |
| CLI model commands             | Cuttledoc and native package CLIs      | `cuttledoc-cli`                 | Consolidate                                      |
| Benchmark/WER tooling          | `scripts/benchmark.ts`, `utils/wer.ts` | benchmark/test support          | Preserve as quality gate                         |
| FLEURS fixtures                | `packages/cuttledoc/fixtures`          | shared fixtures                 | Preserve with license/provenance                 |
| Documentation site             | `packages/docs`                        | production Cuttledoc repo       | Defer until v3 product migration                 |

## Cuttledoc API inventory

### Backends and models

Current identifiers:

- backends: `auto`, `parakeet`, `whisper`, `openai`;
- Parakeet: `parakeet-tdt-0.6b-v3`;
- Whisper: `large-v3-turbo`;
- OpenAI: `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `whisper-1` behavior where timestamps require it.

Current `auto` behavior prefers a supported local backend on macOS and uses OpenAI when appropriate and configured on other platforms. The exact selection table must be captured in contract tests before porting.

### Result model

Current Cuttledoc result includes:

- combined text;
- segments;
- media duration in seconds;
- processing time in seconds;
- language;
- backend;
- optional word timestamps/partial results in the broader type model.

Parakeet currently emits segment times in seconds; Whisper emits milliseconds and Cuttledoc converts them. Rust should use `Duration` internally and one documented unit per external serialization.

### Audio processing

Current `@cuttledoc/ffmpeg` behavior:

- supports common media through a managed FFmpeg 8.0 binary;
- resolves platform and architecture;
- supports `FFMPEG_PATH` override;
- decodes to configurable sample rate/channels;
- converts PCM `s16le` to `Float32Array`;
- calculates duration and manages temporary directories;
- normalizes speech samples before local inference;
- currently downloads the binary in a postinstall script.

ADR-0016 selects the first target boundary: Rust directly invokes an explicit,
`FFMPEG_PATH`, or process-`PATH` executable with no shell, lifecycle download,
or implicit filters. A managed release binary remains a separate distribution
decision requiring its exact build, license, source, digest, security-update,
signing, and rollback evidence.

### OpenAI transcription

Current behavior:

- API key from explicit option or `OPENAI_API_KEY`;
- multipart audio upload;
- model selection;
- `verbose_json` timestamps only where supported;
- structured result conversion;
- no local model download.

Target: Rust HTTP implementation with secret-safe diagnostics and the same domain result.

## Parakeet inventory

### Public behavior to preserve

- Apple Silicon/macOS availability.
- 25 languages: Bulgarian, Czech, Danish, German, Greek, English, Spanish, Estonian, Finnish, French, Croatian, Hungarian, Italian, Lithuanian, Latvian, Maltese, Dutch, Polish, Portuguese, Romanian, Russian, Slovak, Slovenian, Swedish, and Ukrainian.
- `ParakeetAsrEngine` lifecycle: initialize, ready state, transcribe, cleanup, version.
- Custom ASR and VAD model directories.
- Optional automatic model download.
- PCM `f32`, mono, normally 16 kHz.
- Combined text plus timestamped segments.
- VAD options:
  - speech threshold, default `0.5`;
  - minimum silence, default `300 ms`;
  - minimum speech, default `250 ms`.

### Native pipeline

Current Objective-C++ files:

| Source                         | Responsibility                               | Initial target                                              |
| ------------------------------ | -------------------------------------------- | ----------------------------------------------------------- |
| `src/addon.mm`                 | N-API registration and JS/native conversion  | Retire N-API; preserve native calls behind Rust/C boundary  |
| `src/asr_engine.mm/.h`         | CoreML model lifecycle and ASR orchestration | Apple runtime adapter interop, then incremental Rust ownership |
| `src/vad_engine.mm/.h`         | Stateful Silero VAD                          | Apple runtime adapter (crate split per Phase 0)             |
| `src/mel_spectrogram.mm/.h`    | Fallback mel computation                     | Port/test as pure Rust where practical                      |
| `src/transducer_decoder.mm/.h` | TDT token prediction/decision                | Strong candidate for safe Rust port with golden tests       |

Current ASR model artifacts:

- `Preprocessor.mlmodelc`: samples → mel spectrogram;
- `Encoder.mlmodelc`: mel → encoded features;
- `Decoder.mlmodelc`: prediction network;
- `JointDecision.mlmodelc`: joint token decision;
- vocabulary converted to `tokens.txt`.

Current VAD artifact:

- `silero-vad-unified-v6.0.0.mlmodelc`;
- stateful LSTM;
- 576 samples per frame = 36 ms at 16 kHz;
- hidden/cell state dimensions of 128.

The Parakeet encoder has a fixed 240,000-sample input, equal to 15 seconds at 16 kHz. VAD is always used in the current public behavior, natural speech segments are identified, and segments exceeding the limit are split internally. The new API must continue hiding this fixed-shape constraint.

### Model lifecycle

Current roots:

- `~/.cache/parakeet-coreml/models`
- `~/.cache/parakeet-coreml/vad`

Current downloader recursively lists Hugging Face trees, downloads matching files sequentially, converts JSON vocabulary when needed, and reports file-count progress. It deletes an existing target before a forced/full redownload.

Target improvements:

- immutable revision and manifest;
- byte-level progress when possible;
- checksums and expected size/tree;
- temporary paths and atomic commit;
- resume/recovery policy;
- no console output inside the library;
- cache migration from the current roots.

## Whisper inventory

### Public behavior to preserve

- Apple Silicon/macOS availability.
- Whisper `large-v3-turbo` only for initial parity.
- 99-language metadata and `auto` language detection.
- Explicit language, thread count, and GPU/CoreML preference where supported.
- Engine lifecycle: initialize, ready, transcribe, cleanup, version.
- PCM `f32`, mono, normally 16 kHz.
- Combined text, detected language, processing duration, timestamped segments, and confidence.

### Native pipeline

| Source                     | Responsibility                            | Initial target                                         |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `src/addon.cc`             | N-API registration and conversion         | Retire; replace with Rust binding at product boundary  |
| `src/whisper_engine.cc/.h` | whisper.cpp context and result conversion | isolated C/C++ sys boundary used by the Apple runtime adapter |
| vendored `whisper.cpp`     | encoder/decoder inference                 | Keep upstream implementation, pin reproducibly         |

Current split:

- CoreML runs the compute-heavy fixed-shape encoder on ANE.
- whisper.cpp runs autoregressive decoding through Metal/CPU.
- Audio is handled in approximately 30-second Whisper chunks internally.
- Engine calls are not documented as safe for concurrent use.

Current build pins whisper.cpp `v1.8.2`, configures CMake with CoreML and Metal, builds static libraries, and links Accelerate, CoreML, Foundation, Metal, and MetalKit.

Target must preserve the upstream boundary rather than reimplement Whisper. The research question is whether to use an existing Rust wrapper or own a small pinned sys crate with the necessary CoreML configuration.

### Model lifecycle

Current root:

- `~/.cache/whisper-coreml/models`

Required pair:

- `ggml-large-v3-turbo.bin`, currently from `ggerganov/whisper.cpp` on Hugging Face;
- `ggml-large-v3-turbo-encoder.mlmodelc`, from `sebastian-software/whisper-coreml-models`.

Completeness requires both. The GGML download currently buffers all chunks in memory before writing, while the CoreML directory is downloaded file by file. The new downloader should stream to disk, validate, and commit atomically.

The CoreML encoder is derived from OpenAI weights and does not normally need changing when whisper.cpp itself updates. This model-version separation should become explicit in manifests.

## Transcript enhancement inventory

Current `@cuttledoc/llm` provides:

- provider detection;
- Ollama provider;
- OpenAI provider;
- embedded `node-llama-cpp` GGUF provider;
- correction and Markdown-formatting modes;
- chunking, prompts, correction statistics, and model downloads;
- local model metadata including Gemma 3n, Mistral Nemo, and Phi variants;
- multilingual benchmark fixtures and WER-based evaluation.

Disposition:

| Capability                        | Initial v3 disposition                                           |
| --------------------------------- | ---------------------------------------------------------------- |
| Raw transcription                 | Required independently of enhancement                            |
| OpenAI enhancement                | Evaluate for straightforward Rust port                           |
| Ollama enhancement                | Evaluate for straightforward Rust HTTP port                      |
| Chunking and formatting contracts | Preserve as reusable testable logic if enhancement ships         |
| Embedded GGUF                     | Defer until binary size and maintenance are justified            |
| Existing prompts/benchmarks       | Preserve as evaluation inputs, not unquestioned product contract |

## Tests and fixtures to carry forward

### Cuttledoc

- FLEURS samples and references for German, English, Spanish, French, and Portuguese.
- Backend selection tests.
- CLI parsing, validation, output, and benchmark tests.
- Audio conversion and normalization tests.
- WER calculation tests.
- OpenAI response conversion tests.
- LLM multilingual fixtures and benchmark methodology.

### Parakeet and Whisper

- `brian.ogg` smoke fixtures.
- Native E2E initialization/transcription tests.
- Model download/status tests.
- Current API unit tests.
- Version and readiness checks.

Fixture imports must record source, license, expected reference, preprocessing, and whether the asset may be redistributed.

## Known packaging defects that v3 must prevent

- [`parakeet-coreml#18`](https://github.com/sebastian-software/parakeet-coreml/issues/18): npm install rebuilds without publishing `binding.gyp`.
- [`parakeet-coreml#24`](https://github.com/sebastian-software/parakeet-coreml/issues/24): ESM import emits a throwing dynamic require for `bindings`.
- [`whisper-coreml#5`](https://github.com/sebastian-software/whisper-coreml/issues/5): npm install rebuilds without publishing `binding.gyp`.
- [`whisper-coreml#6`](https://github.com/sebastian-software/whisper-coreml/issues/6): ESM import emits a throwing dynamic require for `bindings`.

Required regression tests:

1. Build final release artifacts in CI.
2. Create the actual npm tarball.
3. Install it into an empty project with lifecycle scripts enabled.
4. Load through ESM.
5. Load through CommonJS.
6. Resolve and load the native binary.
7. Run a real model-backed smoke test on Apple Silicon.

## Cache migration

Before changing paths, implement discovery for all legacy roots. Proposed choices per complete cache:

1. Reuse in place when immutable and validated.
2. Adopt through rename on the same filesystem after verification.
3. Copy only when explicitly requested or cross-filesystem.
4. Never silently redownload multi-gigabyte models.

Expose migration status through `cuttledoc doctor` and the model API.

## Repository retirement criteria

Do not deprecate or archive a source repository until:

- its supported behavior has a documented v3 replacement;
- users can install the replacement on supported targets;
- cache/model migration is available;
- its README links to the replacement and support policy;
- outstanding issues are closed, migrated, or explicitly left as historical;
- a final patch can still be published if the v3 rollout needs rollback support.
