# ADR-0006: Select Apple runtimes and models through a measured bakeoff

## Status

Accepted

## Context

The initial plan assumed Parakeet through CoreML as the first vertical slice and Whisper through CoreML plus whisper.cpp as the second. Those implementations are valuable baselines, but newer Apple-optimized models and runtimes may offer better accuracy, streaming, language coverage, latency, memory, energy use, or maintenance characteristics.

CoreML, MLX, Metal-native runtimes, and Apple system Speech APIs are complementary. Their suitability varies by task and model. Selecting one universally before measuring it would overfit the architecture to current packages.

## Decision

Phase 0 includes an Apple Silicon runtime and model bakeoff before choosing the first production vertical slice.

Evaluate, where technically and legally viable:

- the existing Parakeet and Whisper implementations as compatibility baselines;
- CoreML from a Rust-owned lifecycle;
- MLX from Rust through a narrow repository-owned C++ adapter directly over a pinned official `ml-explore/mlx` release; use official `mlx-c` only as an optional pinned control for a named interface or lifecycle question;
- `mlx-rs`, `mlx-node`, and other community bindings as reference/test inputs only unless they independently pass ADR-0005;
- Apple SpeechAnalyzer/SpeechTranscriber as a system baseline;
- maintained Metal-native paths for relevant ASR or LLM models;
- current ASR candidates such as Parakeet variants, Whisper, Nemotron/Canary, Voxtral, and Qwen ASR families.

Measure recognition quality, language and timestamp behavior, real-time factor, streaming/first-result latency, cold load, warm inference, peak memory, energy, model and binary size, conversion effort, packaging, license, update workflow, and dependency maintenance quality.

The selected first vertical slice is the best product foundation supported by evidence, not necessarily the easiest existing port. Unsupported candidates are rejected with a recorded reason rather than stretched into the architecture.

LLM/transcript-enhancement runtime selection is evaluated separately because autoregressive generation may favor a different runtime from ASR.

## Consequences

### Positive

- Avoids spending the migration on parity with a backend that should be replaced.
- Treats Apple hardware performance and energy as first-class product inputs.
- Keeps ASR and LLM runtime choices independent.
- Produces reusable fixtures and benchmark evidence.

### Negative

- Phase 0 is broader and delays the first full backend port.
- Some model candidates will consume research time and be rejected.
- Comparable energy and quality measurements require controlled hardware and fixtures.

## Guardrails

- Model novelty is not a selection criterion.
- Technical feasibility and production dependency suitability are separate conclusions.
- The MLX spike does not recreate a complete operator-level Rust API. It proves the smallest direct task-level bridge needed by a real model and records upgrade effort across at least two official MLX releases; `mlx-c` comparison work is required only when it resolves a specific uncertainty.
- Existing behavior remains a measured baseline and migration input even when a different model wins.
- The bakeoff does not promise that every candidate ships.
- Each chosen production runtime receives a follow-up ADR naming its dependency disposition and interop boundary.

## Validation

The Phase 0 milestone ends with machine-readable benchmark records,
model/runtime recommendations, and follow-up ADRs for the selected ASR and
optional LLM paths. ADR-0015 selects Apple Speech as the first ASR backend with
Whisper as the opt-in fallback. ADR-0014 selects Gemma over the owned official
MLX path as the first local enhancement implementation and Gemini as the
explicit hosted option.
