# ADR-0004: Task-oriented engines and internal runtime adapters

## Status

Accepted

## Context

CoreML, MLX, Metal-native frameworks, whisper.cpp, Apple Speech APIs, and remote APIs expose materially different execution models. A generic CoreML-to-Rust or universal tensor abstraction would either leak runtime details into Cuttledoc or collapse useful capabilities into a lowest common denominator.

Cuttledoc initially needs stable product concepts for speech recognition and text generation. They support transcription and transcript enhancement. Speech synthesis is an explicit later product direction, but its contract must be validated by a real vertical slice before becoming part of the stable API (ADR-0009). The tasks need shared model management, capabilities, cancellation, progress, streaming, backpressure, and deterministic resource ownership.

## Decision

Define stable APIs around tasks and domain results rather than inference runtimes.

- Speech-to-text is exposed through a `SpeechRecognitionEngine`-shaped contract.
- Transcript enhancement and local text generation use a `TextGenerationEngine`-shaped contract.
- Speech synthesis, when validated in Phase 5, receives a separate task contract rather than being forced through recognition or generation.
- Streaming is part of the initial contracts: partial/final transcript updates and generated text deltas. A synthesis vertical slice must determine audio chunk ownership and backpressure before its public contract is fixed.
- Embeddings, vision, image generation, and arbitrary tensor execution are out of the initial architecture scope. They receive separate contracts only after a real product requirement exists.
- Runtime adapters remain internal and may use CoreML, MLX, Metal, C/C++, Apple system APIs, or remote HTTP independently.
- Model identity and runtime identity remain distinct. Multiple runtimes may execute the same model family without changing transcription result types.
- Shared infrastructure is limited to genuine common concerns: model identity and state, installation and verification, capabilities, progress, cancellation, backpressure, diagnostics, errors, lifecycle, and common audio buffer types where applicable.
- Stable APIs never expose raw tensors, Objective-C objects, C++ contexts, MLX arrays, CoreML models, or Node handles.

The public API may support an advanced runtime preference later, but it is a capability-gated hint rather than the organizing abstraction.

## Consequences

### Positive

- Runtime and model choices can evolve without redesigning the product API.
- STT and LLM decisions can be made independently; the future TTS decision can later compose with both without changing their contracts.
- Platform-specific ownership stays behind narrow boundaries.
- Node remains a mechanical binding over the Rust task API.

### Negative

- Some lifecycle and option types cannot be shared across tasks.
- Runtime-specific diagnostics require explicit capability structures.
- Internal adapters may look different instead of satisfying one convenient universal trait.

## Alternatives considered

### Public generic tensor/runtime API

This would turn Cuttledoc into a machine-learning framework and couple callers to implementation details that do not help the transcription product.

### One engine trait for STT, future TTS, and LLMs

Speech recognition, speech synthesis, and autoregressive text generation have different inputs, outputs, streaming directions, options, and model state. Their shared lifecycle does not justify one execution contract.

### Runtime-specific public packages

This recreates the fragmentation ADR-0001 is intended to remove.

## Validation

Validated for the Phase 0 boundary. The legacy finals-only baselines, Apple
Speech volatile-to-final stream, CoreML worker ownership, and direct official
MLX task ABI all map behind recognition-oriented domain types without exposing
runtime handles. ADR-0010 fixes the remaining backend identity, capability,
worker, queue, cancellation, and shutdown semantics.

Issue #7 now validates the separate text-generation delta, deterministic-option,
streaming, cancellation, and mechanical-output-gate boundary. ADR-0014 selects
Gemma through the owned official-MLX path as the first embedded implementation
and Gemini as the explicit hosted option, while keeping future provider and
runtime adapters independently implementable.
Phase 5 validates speech synthesis before accepting its contract (ADR-0009);
it must not be retrofitted through recognition or text generation.
