# Transcript-enhancement implementation

**Status:** The Rust, CLI, Node, local Gemma, explicit Gemini, correction-policy,
and packed-artifact slices of issue
[#25](https://github.com/sebastian-software/cuttledoc-rs/issues/25) are
implemented. A direct 32 GB Apple-Silicon lifecycle smoke remains required
before local enhancement becomes the default.

## Product behavior

Every successful recognition result owns two text fields:

- `raw_text` in Rust/CLI JSON and `rawText` in Node always contain the original
  ASR output;
- `text` contains the accepted enhancement or the exact raw text when
  enhancement is disabled, unavailable, invalid, or rejected by policy.

The high-level pipeline supports three explicit modes:

| Mode | Runtime | Credential/model behavior | Automatic fallback |
| --- | --- | --- | --- |
| `off` | none | Current default pending the 32 GB gate | none |
| `local` | Gemma 4 26B-A4B 4-bit over pinned official MLX | Requires the memory/headroom gate and exact model snapshot | raw text only |
| `gemini` | Gemini 3.6 Flash through OpenRouter and Google Vertex Global | Requires explicit selection and an environment/in-memory credential | raw text only; never another provider |

Configuring `OPENROUTER_API_KEY` does not enable network use. The hosted adapter
pins the model, Google provider, ZDR, denied data collection, no provider
fallbacks, low excluded reasoning, seed zero, and strict JSON schema. The
credential is held in memory and is absent from request JSON, results, errors,
and persisted configuration.

Recognition completes and returns an owned `TranscriptionResult` before
`apply_transcript_enhancement` acquires either generation runtime. Heavyweight
ASR and Gemma resources therefore do not coexist by orchestration design.
Cancellation is checked before generation acquisition, during local decoder
steps, and while the hosted request is active.

## Correction policy

The product embeds the exact frozen
[`conservative-sections-local-diff-v2`](../benchmarks/postprocessing/prompts/conservative-sections-local-diff-v2.txt)
prompt and verifies its committed SHA-256 before release review. The parser
matches the benchmark contract:

- the response must be a JSON object with an ordered `sections` array;
- every section must have the exact input `id` and a string `text`;
- additional diagnostic fields are ignored and cannot affect the result;
- the authoritative word diff is derived locally;
- a section cannot exceed the 30% lexical edit-rate gate;
- glossary, caller-protected, and numeric spans must remain unchanged; and
- the narrow malformed surface sequences `?,` and `!,` are repaired
  deterministically after parsing.

Invalid JSON, missing/reordered sections, excessive edits, changed protected
spans, generation errors, and runtime-acquisition failures produce a
`raw_fallback` result. Cancellation remains an error rather than being hidden
as a fallback.

## Runtime evidence

### Local Gemma

The repository-owned Gemma adapter calls the official MLX C++ core through a
narrow C ABI. Its fixed greedy smoke matches the pinned Python MLX-LM oracle
exactly across prompt-token count, all generated token IDs, stop reason, and
decoded text. The full evidence is in
[`phase0.gemma-4-official-mlx-parity-1`](../benchmarks/raw/phase0.gemma-4-official-mlx-parity-1/result.json).

The 64 GB product smoke then ran the complete sequential pipeline on the
56.88-second German dialogue fixture:

| Stage | Result |
| --- | ---: |
| Apple Speech | 1.90 s |
| Gemma enhancement | 42.35 s |
| Enhancement outcome | applied |
| Raw text retained | exact |
| Protected `15` | unchanged |

Gemma added German dialogue punctuation and repaired missing sentence
punctuation without changing the protected number. See
[`phase5.transcript-enhancement-product.gemma-de-dialogue-1`](../benchmarks/raw/phase5.transcript-enhancement-product.gemma-de-dialogue-1/result.json).
This run proves the 64 GB product path only.

### Hosted Gemini

The same fixture and ASR backend ran through the explicit hosted mode:

| Stage | Result |
| --- | ---: |
| Apple Speech | 1.94 s |
| Gemini enhancement | 1.66 s |
| Enhancement outcome | applied |
| Raw text retained | exact |
| Provider fallback | disabled |

The product repaired one malformed `?,` sequence locally after receiving the
structured response. See
[`phase5.transcript-enhancement-product.gemini-de-dialogue-1`](../benchmarks/raw/phase5.transcript-enhancement-product.gemini-de-dialogue-1/result.json).

These are single synthetic development runs. The five-language model-selection
matrix remains the quality evidence; neither product smoke establishes
universal audiobook or podcast accuracy.

## Delivery

The darwin-arm64 npm tarball contains:

- the prebuilt Node-API addon;
- the repository-owned Gemma MLX adapter dylib;
- the pinned `mlx.metallib`; and
- JavaScript, CommonJS, and TypeScript surfaces.

It excludes MLX source, Rust/C++/Swift build inputs, and the 15.4 GB Gemma model
snapshot. The packed artifact is checked for a package-relative
`@loader_path`, installed with compiler commands blocked, and loaded through
both ESM and CommonJS. The measured development tarball was 41.7 MB compressed.

## Current limits and next gate

The local memory policy requires at least 32 GiB total unified memory and the
verified model snapshot plus 8 GiB of currently reclaimable headroom. The
64 GiB host passes. A real 32 GiB Apple-Silicon machine must still run
sequential STT plus enhancement before `local` replaces `off` as the default.
A synthetic memory override is not sufficient evidence.

The first product slice sends one bounded transcript document per generation
request. It is suitable for the multi-page evaluation scale but does not yet
batch an hours-long podcast or audiobook transcript. Long-document batching,
stable section reconstruction, cancellation between batches, and partial
fallback policy should be the next implementation slice rather than being
hidden inside the runtime adapters.
