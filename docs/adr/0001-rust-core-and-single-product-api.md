# ADR-0001: Rust core and a single product API

## Status

Superseded by [ADR-0019](0019-cli-first-product-distribution.md)

## Context

Cuttledoc currently exposes product behavior through multiple npm packages:

- `cuttledoc` orchestrates audio, backends, models, CLI behavior, OpenAI, and enhancement;
- `parakeet-coreml` exposes a Node-specific native Parakeet/VAD engine;
- `whisper-coreml` exposes a second Node-specific native engine;
- workspace packages separately expose FFmpeg and LLM behavior.

The package boundaries are not independent product boundaries. They require synchronized releases and duplicate installation, model, CLI, ESM/CJS, native-addon, and support concerns. Both CoreML packages have already exhibited identical npm lifecycle and ESM packaging failures.

The project also needs a native CLI and wants Rust to be a first-class implementation language rather than another addon behind TypeScript orchestration.

## Decision

Make a reusable Rust library the architectural center of Cuttledoc.

The Rust core owns:

- backend selection and lifecycle;
- model management;
- audio processing orchestration;
- transcription and result types;
- progress, cancellation, and stable errors;
- cleanup and resource ownership.

Expose that core through:

- the `cuttledoc` Rust crate;
- a native Rust CLI;
- thin `napi-rs` Node bindings;
- one user-facing npm package named `cuttledoc`.

Internal Rust crates and implementation-only binary npm packages are permitted. They are not separate product APIs.

## Consequences

### Positive

- One source of behavior for Rust, CLI, and Node.
- Fewer independently versioned public packages.
- Native ownership and concurrency are represented in the core language.
- Node users install prebuilt artifacts without a compiler.
- New bindings can reuse the product core.
- Backend implementations can remain internally modular.

### Negative

- This is a major migration rather than a small packaging correction.
- Rust/native build and release infrastructure becomes critical.
- TypeScript-only contributors face a higher barrier for core changes.
- Stable Rust and Node APIs need coordinated semantic versioning.
- Some foreign code remains necessary for CoreML and whisper.cpp.

### Neutral

- “One package” describes the user-facing npm surface, not necessarily the number of generated platform artifact packages.
- Existing standalone CoreML APIs may be deprecated rather than reproduced exactly.

## Alternatives considered

### Keep the current repositories and only repair packaging

This is the least disruptive short-term path and should still be used for urgent v2 fixes. It does not address duplicated lifecycle, releases, model management, or the desired Rust-native product.

### Convert each CoreML package independently to Rust

This improves implementation language consistency but preserves the public fragmentation and continues to make Cuttledoc coordinate several product packages.

### Keep TypeScript as the product core with Rust addons

This is familiar for Node consumers but makes the Rust CLI or other bindings second-class and risks reimplementing orchestration outside Node.

## Validation

This product boundary is accepted independently of the concrete Apple inference runtime. Phase 0 must still prove that a Rust-owned engine can invoke a selected local runtime, return structured results, and ship through a thin packed Node binding. If that is not feasible, this ADR must be explicitly superseded rather than silently moving orchestration back into Node.js.
