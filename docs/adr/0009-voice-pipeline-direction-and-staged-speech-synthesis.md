# ADR-0009: Voice-pipeline direction and staged speech synthesis

## Status

Accepted

## Context

Cuttledoc should be able to support speech-to-text, text generation, and text-to-speech as independently usable, composable tasks. That direction enables transcript enhancement and a later complete STT → LLM → TTS pipeline.

Speech synthesis is not yet represented by a selected runtime, model candidate, benchmark, or vertical slice in this repository. Fixing its public types in Phase 0 would therefore turn an intended product direction into an unvalidated release constraint. It could also delay the first Rust-based transcription release despite no current Cuttledoc compatibility requirement depending on TTS.

## Decision

- Keep independently usable speech synthesis and the complete voice pipeline as an explicit product direction.
- Do not make TTS implementation or a stable `SpeechSynthesisEngine` contract part of Phase 0 or the first v3 definition of done.
- Evaluate TTS runtimes and models in Phase 5 through [issue #179](https://github.com/sebastian-software/cuttledoc/issues/179). Build one narrow vertical slice before accepting the public contract.
- The vertical slice must validate audio format negotiation, chunk ownership and timing, streaming/backpressure, cancellation, voice and language selection, lifecycle, model delivery, and Rust/Node mapping.
- Speech synthesis remains a separate task. It must not be folded into `SpeechRecognitionEngine`, `TextGenerationEngine`, or a generic tensor/runtime API.
- A later accepted ADR may promote TTS into a specific release gate after implementation evidence exists.

## Consequences

### Positive

- The product direction remains visible without blocking the first transcription-focused v3 release.
- The TTS API will be shaped by a real runtime and ownership model rather than speculation.
- STT and text-generation contracts remain independently useful and composable.

### Negative

- The complete voice pipeline is not guaranteed in the first v3 release.
- Some potentially shared audio concepts cannot be finalized for synthesis during Phase 0.

## Alternatives considered

### Make TTS release-blocking now

Rejected because no TTS vertical slice currently validates the contract or justifies delaying transcription compatibility.

### Treat TTS like an unspecified future task

Rejected because speech synthesis and the voice pipeline are explicit product directions, unlike embeddings, vision, image generation, or arbitrary tensor execution.

## Validation

[Issue #179](https://github.com/sebastian-software/cuttledoc/issues/179) records candidate runtimes/models, implements a narrow end-to-end synthesis path, and proposes the concrete contract plus release timing in a follow-up ADR.
