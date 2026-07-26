# ADR-0017: Source-integrated whisper.cpp compatibility backend

## Status

Accepted

## Context

ADR-0015 selects Whisper `large-v3-turbo` as the opt-in local quality and
language-coverage fallback after Apple Speech. The measured baseline uses
`whisper-coreml` 1.1.0, whisper.cpp v1.8.2, a GGML model, and its paired Core ML
encoder. Its JavaScript and Node-API ownership cannot enter the Rust-first
product, but the underlying whisper.cpp C API is a suitable narrow runtime
boundary.

whisper.cpp is an active MIT-licensed upstream. v1.9.1 was the latest release
when this decision was recorded, but upgrading the runtime while porting the
backend would remove the existing differential oracle. The measured v1.8.2
source and model pair therefore remains the initial production pin.

The dependency policy requires an explicit source, build, license, security,
upgrade, and replacement contract. It also prohibits implicit network access
during Cargo builds and npm installation.

## Decision

Cuttledoc integrates whisper.cpp through a private repository-owned C ABI and a
safe Rust adapter.

- The initial upstream pin is whisper.cpp v1.8.2 at commit
  `4979e04f5dcaccb36057e059bbaed8a2f5288315`, tree
  `7342a3d8d9bf7e45f7acd0b917340302424f0fef`, with deterministic `git archive`
  SHA-256
  `95e39341ddf07bd7e0b6568b92831737630854567fe38c2c80330e287479bf29`.
- `scripts/fetch-whisper-cpp.sh` is the only repository-owned source
  preparation path. It checks out the exact commit and verifies both tree and
  archive digests. Cargo never clones or downloads source.
- Source is not committed, forked, or registered as a submodule. Developer and
  release builds opt into the native backend with
  `CUTTLEDOC_WHISPER_CPP_DIR`; builds without a prepared tree retain truthful
  unavailable capability behavior.
- The build enables static whisper.cpp, Core ML, and Metal and disables
  examples, tests, shared libraries, and implicit runtime fallback. Cuttledoc
  owns the compiler invocation, link contract, deployment target, and final
  artifact tests.
- The C ABI exposes opaque engine ownership, synchronous normalized PCM
  transcription, segment callbacks, language resolution, cooperative decoder
  cancellation, error strings, and exact cleanup. No whisper.cpp or C++ type
  crosses the Rust or Node product API.
- The initial model is `large-v3-turbo`: GGML SHA-256
  `1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69`
  plus Core ML model-tree SHA-256
  `a4ce8c6307d111df0e08836120f6b14c7852f6ffddcba78f351cbfc436f4d3e0`.
  Models remain external cache artifacts and are not embedded in CLI or npm
  packages.
- Rust owns backend selection, model-path validation, result normalization,
  cancellation, errors, and lifecycle. JavaScript remains a thin options and
  result boundary.
- The old Node implementation's constant `1.0` segment confidence is not
  preserved as evidence. Cuttledoc reports no confidence until a measured
  probability mapping is accepted.

The Cuttledoc maintainers own the adapter and pin. Rollback removes the Whisper
capability from release builds while leaving Apple Speech and raw media
decoding intact.

## Consequences

- The port can be compared directly with the existing v1.8.2 FLEURS,
  multilingual, and audiobook evidence.
- Final npm and CLI artifacts contain compiled whisper.cpp code without
  invoking compilers or network downloads on user machines.
- Source checkouts compile portably without the prepared upstream tree, but
  cannot claim Whisper availability until a source-integrated build is used.
- A release build gains CMake, C, C++, Objective-C, Core ML, Metal, Accelerate,
  and approximately 2–3 GB of external model/cache obligations.
- The upstream repository does not publish a dedicated `SECURITY.md` at this
  decision date. Maintainers must track releases, GitHub advisories, and
  security-relevant upstream issues and can disable the capability independently
  if a safe upgrade is not yet qualified.
- Updating to v1.9.1 or later is a separate dependency change. It must rerun
  transcript, timing, memory, cancellation, lifecycle, and packed-artifact
  comparisons before changing the production pin.

## Alternatives considered

### Keep the existing Node addon

Rejected because it duplicates orchestration, model lifecycle, packaging, and
error behavior outside Rust.

### Vendor or fork whisper.cpp

Rejected for the initial integration because Cuttledoc has no planned source
divergence. An explicit verified checkout keeps upstream identity and makes
updates or removal cheaper.

### Upgrade to the latest whisper.cpp during the port

Deferred until v1.8.2 parity exists. Combining a runtime upgrade with the
ownership migration would make transcript or performance differences
ambiguous.

### Use a community Rust wrapper

Rejected because the dependency policy accepts a small owned C ABI and no
wrapper has demonstrated a lower total ownership or release cost.

## Validation and review triggers

Issue #24 must prove the pinned real-model transcript through Rust, CLI, and
packed Node artifacts; explicit and detected language; segment timing;
cancellation; repeated cleanup; model failures; and final binary size.

Revisit this decision when the pin has a security defect, a newer release
materially improves quality or delivery, Core ML support changes, model
provenance changes, the C ABI needs to expose runtime-specific types, or
shipping the compiled runtime creates an unacceptable artifact cost.

## References

- [ADR-0015](0015-apple-speech-first-local-asr-backend.md)
- [Dependency policy](../dependency-policy.md)
- [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases)
- [whisper.cpp v1.8.2](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.8.2)
- [whisper.cpp license](https://github.com/ggml-org/whisper.cpp/blob/v1.8.2/LICENSE)
- [Issue #24](https://github.com/sebastian-software/cuttledoc-rs/issues/24)
