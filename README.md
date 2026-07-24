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

Cuttledoc is local-first. The selected default pipeline transcribes on the
device and, when the machine has enough unified memory, enhances a copy of the
transcript locally with **Gemma 4 26B-A4B 4-bit over MLX**. The raw transcript
is always retained, invalid or overly broad edits fall back to that raw text,
and Cuttledoc never silently sends a transcript to a hosted service.

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

## Planned workspace

```text
crates/
├── cuttledoc/           # public Rust API and orchestration
├── cuttledoc-audio/     # decoding, resampling, normalization
├── cuttledoc-models/    # manifests, downloads, validation, cache migration
├── cuttledoc-openai/    # cloud transcription backend
├── adapters/            # only accepted runtime/toolchain-specific private crates
│   ├── coreml/          # objc2 ownership boundary, if selected
│   ├── apple-speech/    # Swift C ABI, if selected
│   ├── mlx/             # official MLX C++ task ABI, if selected
│   └── whisper/         # whisper.cpp boundary, if selected
├── cuttledoc-cli/       # native CLI
└── cuttledoc-node/      # thin napi-rs adapter
npm/
└── cuttledoc/           # user-facing npm package and TypeScript facade
docs/
├── adr/
├── architecture.md
├── compatibility-matrix.md
├── migration-inventory.md
└── public-api.md
```

Runtime adapters are split by foreign toolchain and ownership boundary rather
than collected in one broad Apple crate. Candidate crates enter the workspace
only after the bakeoff accepts their production role.

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
