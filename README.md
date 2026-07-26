# cuttledoc-rs

The Rust-first future of [Cuttledoc](https://github.com/sebastian-software/cuttledoc): one transcription engine, one CLI, and one user-facing Node.js package.

> [!IMPORTANT]
> This repository is an architecture and implementation incubator. The production implementation remains in `sebastian-software/cuttledoc` until the compatibility gates in [PLAN.md](PLAN.md) are met.

## Vision

Cuttledoc should be a reusable Rust library rather than a Node.js application that happens to call native addons. The Rust core will own backend selection, model management, audio processing, transcription, timestamps, errors, and lifecycle management. Thin adapters will expose that core as:

- a native `cuttledoc` CLI;
- the `cuttledoc` Rust crate;
- an ergonomic Node.js/TypeScript API through `napi-rs`;
- potentially other bindings later, without duplicating product logic.

The migration consolidates three current repositories:

- [cuttledoc](https://github.com/sebastian-software/cuttledoc)
- [parakeet-coreml](https://github.com/sebastian-software/parakeet-coreml)
- [whisper-coreml](https://github.com/sebastian-software/whisper-coreml)

The existing repositories remain the sources of truth while this incubator is incomplete.

## Design principles

1. **One product API.** Parakeet, Whisper, OpenAI, model management, and audio decoding are capabilities of Cuttledoc, not separate user-facing products.
2. **Rust owns behavior.** Node.js bindings convert values and surface errors; they do not reimplement orchestration.
3. **Internal modularity, minimal publishing surface.** Rust workspace crates preserve boundaries without forcing users to coordinate package versions.
4. **Offline-first on Apple Silicon.** Local Apple backends (CoreML, system Speech, accepted MLX/Metal paths) remain first-class and private. The v3 macOS baseline is Apple Silicon with macOS 26 (ADR-0007).
5. **Compatibility is measured.** Existing fixtures, timestamps, backend selection, CLI behavior, and benchmarks become migration gates.
6. **Prebuilt artifacts only.** End users must never need Xcode, Rust, CMake, or `node-gyp` to install the Node package.
7. **Packed artifacts are the test unit.** CI must test crates, binaries, npm tarballs, ESM, CommonJS, and clean-machine installation.

## Transcript enhancement direction

Cuttledoc is local-first. The selected target pipeline transcribes on the
device and, when the machine has enough unified memory, enhances a copy of the
transcript locally with **Gemma 4 26B-A4B 4-bit over MLX**. The implementation
is available through explicit `local` selection. The current default remains
`off` until the required direct 32 GB Apple-Silicon smoke is complete. The raw
transcript is always retained, invalid or overly broad edits fall back to that
raw text, and Cuttledoc never silently sends a transcript to a hosted service.

The Gemma snapshot is about 15.4 GB, so **32 GB of unified memory is
recommended** for useful operating headroom. On smaller machines, transcript
enhancement should remain off instead of falling back to the tested small local
models, which did not correct transcripts reliably.

Users who explicitly configure an OpenRouter API key can instead select
**Gemini 3.6 Flash** as the hosted quality option. On the frozen five-language
development challenge, the aggregate results were:

| Processing | WER | Relative error reduction |
| --- | ---: | ---: |
| Raw transcript | 6.56% | — |
| Local Gemma 4 26B-A4B | 5.12% | 22.0% |
| Hosted Gemini 3.6 Flash | 4.17% | 36.4% |

Gemini was the strongest clean hosted choice and remained ahead of the later
prominent German/English challengers. These selected synthetic development
results guide the product defaults; they are not universal accuracy claims for
podcasts or audiobooks. See the
[factorial benchmark](docs/postprocessing-factorial-benchmark.md) and the
[local-first decision](docs/adr/0014-local-first-transcript-enhancement-defaults.md)
for the full evidence and limitations.

The direct product smokes are now complete on a 64 GB M1 Ultra. On the same
56.88-second German dialogue fixture, Apple Speech took 1.90–1.94 seconds,
local Gemma applied an accepted correction in 42.35 seconds, and explicit
Gemini applied an accepted correction in 1.66 seconds. These are single
development runs, not general latency claims. See the
[implementation report](docs/transcript-enhancement-implementation.md).

## Workspace

```text
crates/
├── adapters/
│   ├── apple-speech/    # private Swift C ABI boundary
│   ├── gemma-mlx/       # private official-MLX C++ task boundary
│   ├── openrouter/      # private Foundation HTTP boundary
│   └── whisper/         # private whisper.cpp C++/C ABI boundary
├── cuttledoc-audio/     # owned external media-decoding boundary
├── cuttledoc/           # public Rust contracts and orchestration
├── cuttledoc-models/    # model identity and provisioning
├── cuttledoc-cli/       # native CLI
└── cuttledoc-node/      # thin napi-rs adapter
```

Runtime adapters are split by foreign toolchain and ownership boundary rather
than collected in one broad Apple crate. Candidate crates enter the workspace
only after the bakeoff accepts their production role. Apple Speech is the
first-choice local backend. The opt-in Whisper `large-v3-turbo` compatibility
backend adds broader language coverage through a source-integrated,
repository-owned boundary over pinned whisper.cpp v1.8.2. General media
decoding, local/hosted transcript enhancement, and the npm facade are already
Rust-owned.

The workspace uses the pinned Rust 1.88 toolchain. Its local verification gate
is:

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
bash scripts/check-dependency-policy.sh
```

## Development CLI

The native CLI accepts ordinary audio or video through an explicitly configured
or system FFmpeg executable. The owned Rust boundary selects the first audio
stream, downmixes it, and resamples it to mono 16 kHz `f32` without hidden
filters:

```sh
cargo run --locked -p cuttledoc-cli -- \
  transcribe input.ogg --language en-US
```

Use `--ffmpeg-path /absolute/path/to/ffmpeg` or `FFMPEG_PATH` when FFmpeg is
not available on `PATH`. Advanced callers can bypass media decoding with
`transcribe-pcm`, which accepts mono little-endian `f32` PCM and an explicit
sample rate.

`backends list` reports both local backends and the live system/model
availability, followed by the local and hosted text-generation capabilities.
`auto` remains strictly local: it selects Apple Speech when the
requested locale is available and otherwise uses Whisper only when its pinned
model pair is available. It never sends audio to a hosted service.

Whisper is an explicit quality/language-coverage fallback. Development builds
prepare the pinned upstream source before enabling the adapter:

```sh
scripts/fetch-whisper-cpp.sh target/vendor/whisper.cpp-v1.8.2

CUTTLEDOC_WHISPER_CPP_DIR="$PWD/target/vendor/whisper.cpp-v1.8.2" \
  cargo run --locked -p cuttledoc-cli -- \
  transcribe input.ogg \
  --backend whisper \
  --language auto \
  --model-path /path/to/ggml-large-v3-turbo.bin
```

The `.bin` file must be accompanied by
`ggml-large-v3-turbo-encoder.mlmodelc`. Cargo and npm installation never
download source or models implicitly. The complete model-management workflow
is tracked separately in issue #27.

Enhancement is explicit until the 32 GB gate is complete:

```sh
# Local Gemma over pinned official MLX
cuttledoc transcribe input.ogg \
  --language de-DE \
  --enhance local \
  --enhancement-model-path /path/to/gemma-4-26b-a4b-it-4bit \
  --json

# Hosted Gemini through the pinned OpenRouter route
OPENROUTER_API_KEY=... \
  cuttledoc transcribe input.ogg \
  --language de-DE \
  --enhance gemini \
  --json
```

`--json` exposes both `raw_text` and the accepted/fallback `text` plus
enhancement metadata. Configuring a key does not activate hosted processing;
`--enhance gemini` is always required.

Local recognition requires Apple Silicon with macOS 26 or newer. Apple Speech
also requires normal access to the macOS Speech service.

## Development Node API

The Node.js surface accepts media files through the same Rust-owned decoder and
returns the structured Rust result without a second orchestration layer:

```js
import { transcribeFile } from 'cuttledoc';

const result = await transcribeFile('/path/to/podcast.m4a', {
  language: 'en-US',
  enhancement: 'local',
});
console.log(result.text);
console.log(result.rawText);
```

Select the compatibility backend explicitly when needed:

```js
const result = await transcribeFile('/path/to/podcast.m4a', {
  backend: 'whisper',
  language: 'auto',
  modelPath: '/path/to/ggml-large-v3-turbo.bin',
});
```

`transcribePcm` remains the advanced decoder bypass. `AbortSignal` cancels
FFmpeg, recognition, or enhancement through the shared Rust cancellation
token. `enhancement: 'gemini'` reads `OPENROUTER_API_KEY` only after explicit
selection; provider orchestration remains in Rust. The current package contains
only a prebuilt macOS arm64 artifact and requires Node 22 or newer; installation
does not run Cargo, Xcode, CMake, or `node-gyp`. Its packed local-generation
runtime includes the repository-owned Gemma adapter and pinned MLX Metal
library, but not the 15.4 GB model snapshot.
Build and exercise the exact npm tarball through both ESM and CommonJS with:

```sh
bash scripts/test-cuttledoc-node-package.sh
```

## First proof

The first implementation milestone is deliberately narrow:

```text
16 kHz mono samples
  → Rust public API
  → selected local speech-recognition engine proxy
  → adapter-owned worker and native runtime
  → structured TranscriptionResult
  → napi-rs binding
  → packed npm tarball
  → Node ESM and CommonJS smoke tests
```

This slice must load a model, transcribe a real fixture, release resources, and install without compiling on a clean Apple Silicon machine. No broad port starts before this risk is retired.

## Documentation

- [Delivery plan](PLAN.md)
- [Target architecture](docs/architecture.md)
- [Audio use cases and preprocessing scope](docs/audio-use-cases.md)
- [July 2026 speech-engine shortlist](docs/speech-engine-shortlist-2026-07.md)
- [Proposed public APIs](docs/public-api.md)
- [Migration inventory](docs/migration-inventory.md)
- [Compatibility matrix and quality gates](docs/compatibility-matrix.md)
- [Architecture decisions](docs/adr/README.md)

## Repository strategy

This repository is intentionally not a GitHub fork. It combines three codebases and changes their architectural center. Once the Rust implementation reaches the release gates, the result should become Cuttledoc v3 in the existing `sebastian-software/cuttledoc` product repository so its history, users, issues, releases, and package identity remain intact.

## License

The source code is [MIT-licensed](LICENSE) unless a file says otherwise.
Redistributable benchmark media under
[`benchmarks/assets`](benchmarks/assets/README.md) carries separate per-asset
licensing and is excluded from product archives and packages.
