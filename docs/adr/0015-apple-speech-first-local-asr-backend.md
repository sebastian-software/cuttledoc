# ADR-0015: Apple Speech as the first local ASR backend

## Status

Accepted

## Context

Phase 0 compared Apple SpeechTranscriber, Whisper large-v3-turbo, Parakeet,
Qwen3-ASR, Voxtral Realtime, and Whisper Tiny over MLX on the Apple Silicon
macOS 26 baseline. The first product vertical slice needs one deliberately
small backend scope; keeping every measured candidate in the first workspace
would turn feasibility evidence into permanent implementation cost.

On the ten-fixture multilingual comparison, Apple SpeechTranscriber reached
7.58% macro WER with 189.5 ms warm latency and 24 MB peak process RSS. It also
provided real incremental volatile-to-final updates, word timestamps, and a
system-managed model. Whisper large-v3-turbo reached a better 5.61% macro WER,
but used a 2.90 GB model, about 2 GB peak process RSS, 774.2 ms warm latency,
and returned final-only segment results.

The small fixture count does not establish a universal accuracy ranking.
It does establish that Apple Speech is the lowest-cost path for validating the
real Rust, streaming, CLI, Node, packaging, and lifecycle architecture, while
Whisper retains a meaningful quality and language-coverage role.

## Decision

Apple SpeechTranscriber through the repository-owned Swift C ABI is the first
local ASR backend for the Phase 2 product vertical slice.

- Rust owns backend selection, lifecycle, domain results, reduction of
  range-addressed updates, cancellation, errors, and public API behavior.
- Swift owns only the narrow system-framework actor and C ABI boundary.
- `auto` prefers Apple Speech when the requested locale and system asset are
  available. An unavailable system asset produces an explicit capability or
  provisioning result; it does not silently invoke a remote service.
- Whisper large-v3-turbo through the existing whisper.cpp/CoreML/Metal
  boundary is the first opt-in local quality and coverage fallback. It enters
  after the Apple Speech vertical slice proves the shared product path.
- Qwen3-ASR and Voxtral Realtime remain measured official-MLX candidates.
  Parakeet remains compatibility evidence. None belongs in the initial
  workspace until a concrete language, streaming, or deployment requirement
  justifies its product cost.

## Consequences

- Phase 1 can scaffold only the crates and adapter boundary needed by one real
  backend instead of carrying the complete research matrix into production.
- The first packed product path has no repository-distributed ASR model and can
  exercise genuine streaming updates with low measured memory use.
- Results depend on system-managed Apple assets whose exact model revision and
  size are opaque. Capability reporting, installation, reservation, release,
  and shipped executable identity must therefore be tested explicitly.
- Whisper remains necessary for users who prioritize its measured quality,
  broader behavior, or reproducible model identity over the smaller system
  path.
- Adding Qwen, Voxtral, or Parakeet later does not change the public speech
  engine or transcript result contracts.

## Validation and review triggers

The first vertical slice must transcribe a real fixture through Rust, CLI, and
the packed Node artifact; preserve volatile-to-final range updates; exercise
asset provisioning, cancellation, repeated lifecycle, and actionable errors;
and run from the shipped executable identity.

Revisit the default only when held-out target-domain evidence, unavailable
priority locales, system-asset delivery failures, or a material product
requirement makes another measured backend a better default. Release-threshold
energy and clean-host measurements may tune selection without reopening the
Phase 1 workspace boundary.

## References

- [Apple-local ASR model evaluation](../model-evaluation.md)
- [Apple runtime evaluation](../apple-runtime-evaluation.md)
- [ADR-0007](0007-apple-silicon-macos-26-baseline.md)
- [ADR-0008](0008-streaming-first-transcription-results.md)
- [ADR-0010](0010-capability-oriented-engine-ownership.md)
