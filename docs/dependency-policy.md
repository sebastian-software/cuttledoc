# Dependency policy and Phase 0 disposition inventory

**Status:** binding for Phase 0 and later.

**Evidence snapshot:** 2026-07-21.

**MLX route reaffirmed:** 2026-07-17.

**Authority:** [ADR-0005](adr/0005-third-party-dependency-policy.md).

This document turns ADR-0005 into a review gate. It applies to every runtime,
build-time, code-generation, and transitive dependency that can reach a
development build, a release artifact, or a stable public API. Models, managed
binaries, source archives, generated bindings, vendored code, and system
frameworks are reviewed in the same way; they are not loopholes around the
Cargo dependency graph.

## Rules

1. A technical spike does not grant production status. It records only the
   evidence needed to make a later decision.
2. A production dependency needs a row in the inventory with an explicit
   decision, an owner, a bounded role, a version/revision pin, a source and
   license review, and a replacement path.
3. `Reference only` means absent from `Cargo.toml`, build scripts, generated
   bindings, release artifacts, and stable APIs. It may inform a benchmark,
   fixture, or design note.
4. A repository-owned boundary is a small, owned adapter around an established
   upstream. The adapter owns the Rust-facing API, lifecycle, thread-affinity,
   error translation, and build/distribution contract. It does **not** vendor
   upstream by default.
5. Forking or vendoring needs a separate accepted ADR naming the code and
   license, maintenance owner, upstream/security process, CI matrix, expected
   divergence, and exit plan.
6. Additions or material upgrades must be reviewed before the manifest change.
   A lockfile update alone is not evidence of acceptance.

The evidence snapshot below is deliberately time-bound. Stars and recent
commits are useful signals, not acceptance criteria; governance, security
response, release discipline, CI, binary/transitive cost, and replaceability
remain part of each actual adoption review.

## Phase 0 dispositions

| Candidate | Decision | Reason and permitted scope |
| --- | --- | --- |
| [MLX](https://github.com/ml-explore/mlx) | Approved upstream foundation for a repository-owned candidate | Apple-maintained MIT upstream with releases (`v0.32.0` at the snapshot). It is the source of truth and the third first-class inference candidate. #6 builds a narrow owned C++ adapter directly over a pinned official MLX release/revision; MLX is not imported as a Rust crate and its types never cross the product API. |
| [MLX-LM](https://github.com/ml-explore/mlx-lm) | Reference only | Official Apple-maintained MIT text-generation implementation and the pinned issue-#7 oracle. Its Python package, tokenizer integration, model classes, and server do not enter product manifests or stable APIs. A selected embedded model is reimplemented behind the narrow owned official-MLX task adapter. |
| [mlx-c](https://github.com/ml-explore/mlx-c) | Optional reference/control only | Official MIT C API, but **no GitHub releases**. It is not the product integration route. Use it only when a concrete interface or lifecycle question benefits from a secondary control; each use names an audited `mlx-c` commit and corresponding MLX revision. The current audited baseline is `fba4470b89073180056c9ea46c443051375f7399`, generated for MLX `0.31.2`. No floating `main`, documentation version, or unrecorded generated bindings are allowed. |
| Owned C++ adapter over MLX | Repository-owned boundary candidate | The intended MLX route: a small task-level C ABI directly over official MLX, pinned to a release/revision. It exposes no MLX types publicly and owns lifecycle, errors, thread-affinity, build, and distribution. Production adoption still requires spike and bakeoff evidence plus a dedicated accepted ADR. |
| [mlx-rs](https://github.com/oxiglade/mlx-rs) | Reference only | A useful community Rust binding and comparison source, but it is an additional wrapper/API and build path over MLX. It must not become a shortcut around ownership, update, or binary-size evidence. |
| [OminiX-MLX](https://github.com/OminiX-ai/OminiX-MLX) | Reference only | Young, task-specific MLX implementation. It can supply prior art and fixtures but is not an acceptable critical ASR, TTS, or LLM runtime dependency. |
| [mlx-audio](https://github.com/Blaizzy/mlx-audio) | Phase 5 speech reference runner; each execution pin reviewed separately | The active MIT project supplies practical Apple Silicon implementations for the July 2026 Qwen VoiceDesign, Voxtral TTS BF16, KugelAudio, and bounded ASR qualification candidates. The historical Qwen3-TTS 0.6B and Voxtral TTS 4-bit evidence stays pinned to audited commit `64e8416c303fb3b3463dab8eb4ebd78c55a87c1a`; new candidates must not reuse that pin implicitly. Measurements compare retaining the selected MLX-Audio subset with owning a narrow model adapter directly over official MLX. Production adoption still requires ADR-0005 evidence for exact packages, Python/Swift/runtime ownership, model delivery, updates, binary/transitive cost, and replacement. Until that review passes, it remains absent from product manifests and release artifacts. |
| [mlx-node](https://github.com/mlx-node/mlx-node) | Reference only | Node/C++ ownership and its own packaging model conflict with the Rust-owned core and thin Node boundary. It can inform npm artifact tests only. |
| [`objc2-core-ml`](https://docs.rs/objc2-core-ml/) via [objc2](https://github.com/madsmtm/objc2) | Accepted production dependency, bounded | The versioned `objc2` framework crates provide the narrow Rust-to-Objective-C boundary needed by the CoreML spike (`objc2-core-ml` `0.3.2` at the snapshot). Acceptance is limited to an internal Apple adapter; no Objective-C type crosses the product API. #5 must still demonstrate required API coverage, ownership, thread behavior, deployment target, and binary impact. |
| [mistral.rs](https://github.com/EricLBuehler/mistral.rs) | Reference only | Active MIT project with releases, but its broad multimodal runtime and feature surface are disproportionate to the initial product boundary. Reconsider only in the separate Phase 5 LLM evaluation. |
| [Candle](https://github.com/huggingface/candle) | Reference only | Established Apache-2.0 upstream and useful Rust prior art. It is not selected for the initial ASR path or embedded LLM runtime; a Phase 5 proposal must re-evaluate its selected crates and transitive cost. |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | Reference and embedded fallback candidate | Mature MIT upstream with frequent builds, an owned C API, Metal support, and broad GGUF model availability. Issue #7 does not add it to production: doing so would add a second native runtime and GGUF cache beside the accepted MLX/safetensors path. Reconsider if cross-platform embedded generation or measured model availability justifies that cost. |
| Core ML text generation | Deferred platform candidate | Stateful models can represent a KV cache on current Apple platforms, but Cuttledoc has no selected converted instruction artifact with a measured advantage. A proposal must pin conversion provenance and demonstrate a concrete size, energy, compute, or deployment win over the official-MLX path. |
| Ollama text-generation provider | Repository-owned provider adapter candidate | Ollama may be addressed through its local HTTP API without entering the embedded runtime or cache boundary. Product work must define process discovery, model identity, capability/error mapping, cancellation, privacy, and replacement independently from OpenAI and embedded backends. |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Accepted production dependency, bounded | ADR-0017 accepts v1.8.2 at commit `4979e04f5dcaccb36057e059bbaed8a2f5288315` behind the repository-owned C ABI for the opt-in `large-v3-turbo` compatibility backend. The explicit fetcher verifies the source tree and archive digest before Cargo receives `CUTTLEDOC_WHISPER_CPP_DIR`; Cargo and npm installation never download source. CoreML/Metal static linking and the paired external model artifacts are limited to macOS Apple Silicon release builds. Upgrades require the differential transcript, lifecycle, memory, and artifact gates in ADR-0017. |
| [napi-rs](https://github.com/napi-rs/napi-rs) | Accepted production dependency, bounded | Accepted only for the thin `cuttledoc-node` Node-API boundary and prebuilt-artifact packaging. It must not contain product orchestration or runtime ownership. The exact crate versions enter the allowlist with the future workspace change and are validated by ESM/CommonJS artifact tests. |
| [`serde_json`](https://github.com/serde-rs/json) | Accepted production dependency, bounded | Version `1.0.151` is pinned for provider-neutral JSON generation contracts, strict transcript-correction response parsing, and hosted-provider envelopes. The crate is maintained under the serde-rs organization, requires Rust 1.71, is dual MIT/Apache-2.0 licensed, and enters with default `std` only. Its resolved runtime graph is `itoa` 1.0.18, `memchr` 2.8.3, `serde_core` 1.0.229, and `zmij` 1.0.23; no derive/code-generation path reaches the product crate. JSON remains an internal wire/policy representation rather than a public Rust domain type. Cuttledoc owns schema validation and can replace the parser without changing the task API. |
| FFmpeg/audio | Accepted external-process boundary; managed binary deferred | ADR-0016 accepts direct invocation of an explicitly configured or user-installed FFmpeg executable behind the Rust-owned audio boundary. No FFmpeg crate, library link, bundled binary, or lifecycle download enters the product. A managed release binary still requires its exact source/version, build configuration and resulting LGPL/GPL status, digest, source distribution obligations, update process, signing, and rollback evidence. |

### Evidence notes

The initial snapshot observed current maintenance signals on 2026-07-16: MLX (27.6k
stars, 2.0k forks), Candle (20.7k, 1.7k), whisper.cpp (51.8k, 5.8k), napi-rs
(7.8k, 399), and mistral.rs (7.5k, 660) all had recent upstream activity.
Community candidates had materially smaller or newer footprints: mlx-rs (357
stars), OminiX-MLX (57; created 2026-01), and mlx-node (145; created 2025-11).
These observations explain the conservative dispositions; they do not replace
the gate. The MLX-Audio TTS disposition was refined on 2026-07-20 after the
Phase 5 candidate review and exact source pin.

Source and release checks used for the snapshot:

- [MLX releases](https://github.com/ml-explore/mlx/releases) and
  [mlx-c releases](https://github.com/ml-explore/mlx-c/releases)
- [mlx-rs releases](https://github.com/oxiglade/mlx-rs/releases),
  [OminiX-MLX releases](https://github.com/OminiX-ai/OminiX-MLX/releases),
  [mlx-audio releases](https://github.com/Blaizzy/mlx-audio/releases), and
  [mlx-node releases](https://github.com/mlx-node/mlx-node/releases)
- [mistral.rs releases](https://github.com/EricLBuehler/mistral.rs/releases),
  [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases), and
  [napi-rs releases](https://github.com/napi-rs/napi-rs/releases)

## Required evidence for a proposed production pin

The proposal must state all of the following in its ADR or change request:

- upstream URL, selected package(s), exact version/commit, source digest, and
  license/provenance;
- current maintainer/governance, releases/tags, open security process, and
  supported macOS/Rust/Node/upstream CI;
- direct and transitive dependency list, binary/model size impact, build tools,
  generated code, and release artifacts;
- Apple Silicon runtime evidence: cold/warm load, first-result latency,
  throughput, peak memory, energy procedure, cleanup, cancellation, and
  thread-affinity behavior;
- fixture/quality evidence and a fallback or replacement boundary; and
- a named Cuttledoc owner and upgrade/rollback plan.

For the owned MLX adapter, the proposal records the immutable official MLX
release/revision, source digest, build configuration, generated artifacts, and
compatibility test matrix. If `mlx-c` is used as an optional control, it also
records its immutable commit and the MLX revision/version it was generated
against. Neither source nor generated bindings are fetched implicitly during a
release build.

## Automated gates

`scripts/check-dependency-policy.sh` is the immediate policy gate. Once a
Cargo workspace exists it rejects direct dependencies missing from
`docs/dependency-allowlist.txt` and rejects the projects currently classified
as reference-only. `.github/workflows/dependency-policy.yml` then runs
`cargo-deny` for advisories, licenses, sources, and duplicate versions. A
manifest addition must update the inventory and allowlist in the same reviewed
change; the CI check intentionally makes an unreviewed dependency fail.

The `cargo-deny` configuration is a baseline, not a waiver mechanism. Any
exception is time-bounded, documented beside the inventory entry, and removed
when the upstream issue is resolved or the dependency leaves the graph.
