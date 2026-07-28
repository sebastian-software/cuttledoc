# ADR-0007: Apple Silicon and macOS 26 baseline for v3

## Status

Accepted; the Cuttledoc 2 support-window clauses are superseded by
[ADR-0018](0018-cut-over-to-the-cuttledoc-product-repository.md)

## Context

Cuttledoc 2 nominally supports Intel macOS, but the core value proposition — local Apple-optimized ASR — has always been Apple Silicon only. Keeping an `x86_64-apple-darwin` cloud-only target in v3 would cost a permanent build target, CI lane, and release-test surface for a discontinued platform.

Apple's SpeechAnalyzer/SpeechTranscriber APIs require macOS 26 (Tahoe) and have no Objective-C or C interface: they are Swift-only. Supporting older macOS versions would force a permanent availability-gated dual path in which the system Speech backend is an optional extra rather than a first-class bakeoff candidate.

CoreML async prediction is available before macOS 26, and stateful models (`MLState`) are available from macOS 15. They are therefore not reasons by themselves to select macOS 26. The synchronous prediction API is not thread-safe on one `MLModel`; the async prediction API (macOS 14+) is explicitly designed for concurrent predictions on one instance. Predictions that share one `MLState` must be serialized. The macOS 26 baseline is primarily a product/support decision around SpeechAnalyzer and a deliberately smaller release matrix.

Cuttledoc 2 remains a released, working product for users on older systems.

## Decision

- Cuttledoc v3 supports macOS only on Apple Silicon (`aarch64-apple-darwin`) with a macOS 26 deployment target.
- macOS Intel is not supported by v3 at all, including cloud-only transcription. Cuttledoc 2 remains the product for Intel Macs and for macOS releases before 26.
- The Phase 7 migration plan must define an explicit Cuttledoc 2 support window (at minimum critical fixes) before v3 replaces it.
- Apple SpeechAnalyzer/SpeechTranscriber is promoted from "system baseline measurement" to a full bakeoff candidate, reached through a repository-owned Swift shim (ADR-0005 decision class 2). The spike must verify AssetInventory identity, reservation, code-signing, and packaging behavior for unbundled CLI and library consumers rather than assuming an undocumented bundle-identifier solution.
- Linux and Windows cloud-only support is unchanged.

## Consequences

### Positive

- One macOS build target and one deployment baseline; no weak linking or `#available` dual paths.
- SpeechAnalyzer competes on equal footing in the Phase 0 bakeoff, including its streaming-first result model.
- SpeechAnalyzer needs no weak-linking or runtime availability fallback. CoreML capabilities from earlier macOS releases are also usable unconditionally at this deployment target, while retaining their documented serialization rules.
- Smaller compatibility, CI, and release matrices.

### Negative

- Users on macOS 14/15 (Sonoma/Sequoia) cannot use v3 until they upgrade; they stay on Cuttledoc 2.
- The release build for the Speech shim requires a Swift toolchain in addition to Rust.
- Self-hosted Apple Silicon runners must run macOS 26 to exercise the Speech backend.

## Alternatives considered

### macOS 14/15 baseline with weak-linked Speech

Keeps a broader install base but makes the system Speech backend a permanently optional capability and requires additional availability and release-test paths. A macOS 15 baseline would still support stateful CoreML; this alternative is rejected for product-scope simplicity, not because CoreML requires macOS 26.

### Keep Intel macOS as cloud-only

Pays a permanent target, CI, and support tax for a shrinking platform on which the differentiating local features can never work.

## Validation

The Phase 0 SpeechAnalyzer spike must prove the Swift shim from a Rust-owned lifecycle, including asset installation and identity behavior for a CLI, timestamps, confidence, and range-based replace/revoke/final result handling. The compatibility matrix and PLAN.md reflect this baseline.

## References

- [WWDC23: Improve Core ML integration with async prediction](https://developer.apple.com/videos/play/wwdc2023/10049/)
