# ADR-002: Evaluate next-generation open-weight ASR backends

**Date:** 2026-07-16
**Status:** Accepted
**Authors:** Sebastian Werner

## Context

cuttledoc currently exposes two offline Apple Silicon backends:

- Parakeet TDT 0.6B v3 through `parakeet-coreml`
- Whisper large-v3-turbo through `whisper-coreml`

Both dependencies are model-specific Node N-API addons. The CoreML backend is
not a generic FluidAudio host: its type, download, initialization, and result
mapping paths all explicitly branch between those two packages. The benchmark
command likewise only accepts registered cuttledoc backends.

Three newer open-weight model families were evaluated as possible replacements
or complements. This snapshot records the state verified on 2026-07-16; model
ports and runtimes are moving quickly, so the linked model cards remain the
source of truth.

## Evaluation

| Candidate                                                                                               | Verified license | Apple-native path                                                                                              | Published footprint                                       | Fit for cuttledoc today                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Cohere Transcribe 03-2026](https://huggingface.co/CohereLabs/cohere-transcribe-03-2026)                | Apache-2.0       | [FluidAudio CoreML](https://huggingface.co/FluidInference/cohere-transcribe-03-2026-coreml)                    | 1.8 GB INT8 encoder + 291 MB FP16 decoder                 | Batch-only accuracy candidate, but no Node API and the CoreML pipeline has a 35-second per-call cap          |
| [NVIDIA Nemotron 3.5 ASR Streaming 0.6B](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b) | OpenMDW-1.1      | [FluidAudio CoreML](https://huggingface.co/FluidInference/Nemotron-3.5-ASR-Streaming-Multilingual-0.6b-CoreML) | Eight language/tier bundles rather than one drop-in model | Strong streaming complement, but no Node API and the CoreML weights currently require manual access approval |
| [Qwen3-ASR 0.6B](https://github.com/QwenLM/Qwen3-ASR)                                                   | Apache-2.0       | [FluidAudio CoreML](https://huggingface.co/FluidInference/qwen3-asr-0.6b-coreml) and community MLX             | approximately 0.7 GB INT8 or 2.5 GB FP32                  | Compact multilingual accuracy candidate, but no Node API and no comparable FLEURS result yet                 |

### Cohere Transcribe

The upstream model has 2B parameters, supports 14 languages, and recommends
Python Transformers for offline inference. FluidAudio supplies a native Swift
CoreML pipeline, not a Node package. Its published CoreML results currently
cover only English and French FLEURS, so they do not satisfy cuttledoc's
EN/DE/FR/ES/PT comparison requirement.

The port's hard 35-second input window would also require cuttledoc-owned
chunking and transcript stitching before it could handle the same long-form
inputs as the existing backends. The roughly 2.1 GB quantized bundle is not an
obvious footprint improvement over the existing local choices.

### Nemotron 3.5 ASR Streaming

The base checkpoint's governing terms are unambiguously OpenMDW-1.1. It offers
40 language-locales in three readiness tiers, cache-aware streaming, and
punctuation and capitalization. The FluidAudio port currently exposes optimized
bundles for English, Spanish, French, Italian, Portuguese, German, Chinese, and
Japanese at four latency tiers.

Published CoreML FLEURS results show the intended trade-off: the recommended
2.24-second tier reports 8.96% EN, 9.83% DE, 9.52% FR, 4.80% ES, and 6.14% PT
WER with high throughput on an Apple M5 Pro. Those numbers come from different
hardware and tooling than cuttledoc's Apple M1 Pro benchmark, so they are useful
for triage but must not be inserted into cuttledoc's comparison table.

This model is a streaming complement, not a demonstrated replacement for
Parakeet. Integrating it also requires a streaming public API, partial-result
semantics, reset/cancellation behavior, language-locale mapping, attribution,
and a Node-native bridge. The CoreML repository currently directs users to a
Discord approval flow, which prevents a reproducible unattended download path.

### Qwen3-ASR

Qwen3-ASR 0.6B and 1.7B support 30 languages and 22 Chinese dialects, with
offline and streaming inference. The official runtime is Python
Transformers/vLLM. Contrary to the initial research snapshot, a FluidAudio
CoreML conversion now exists for the 0.6B model alongside community MLX
conversions.

The CoreML port reports 4.4% WER on LibriSpeech test-clean on an Apple M4 Pro,
versus 2.11% for the official PyTorch model. It does not publish the five-way
FLEURS data needed for a cuttledoc comparison. Adding an MLX runtime would not
solve the Node boundary: the available MLX ASR path is Python-based, while the
CoreML path is Swift-based.

## Benchmark decision

No new numbers are added to cuttledoc's benchmark table in this evaluation.
The existing harness invokes the public cuttledoc CLI and can therefore measure
only a model that is available as a real backend. Running vendor Python or
FluidAudio Swift commands beside it would change decoding, chunking, audio
normalization, hardware, and timing boundaries. Such results would look
comparable while measuring a different stack.

A candidate is eligible for the canonical benchmark only after all of the
following are true:

1. A Node 22+ arm64 macOS adapter accepts normalized 16 kHz mono
   `Float32Array` audio and returns cuttledoc-compatible text and segments.
2. Model artifacts can be downloaded non-interactively, checksummed, cached,
   and checked for completeness.
3. Long-form behavior is defined and tested; streaming models additionally
   expose partial/final result and reset semantics.
4. The adapter is registered as a cuttledoc backend so the existing CLI
   benchmark measures identical fixture loading, normalization, WER, and RTF
   boundaries.
5. EN/DE/FR/ES/PT FLEURS fixtures are run on the same Apple Silicon machine as
   Parakeet and Whisper.

The acceptance target for a replacement is not a vendor leaderboard win. It
must improve either average five-language WER or RTF by at least 10% without a
regression greater than 15% in the other metric. A streaming complement must
process incremental audio, return stable final text, and stay below one second
end-to-end partial-result latency at its selected tier.

## Decision

Keep Parakeet as the default local backend and Whisper as the broad-language
fallback. Do not add a Python subprocess or an MLX dependency solely for these
models; [ADR-001](./001-remove-python-asr-backends.md) already records why that
operational shape was removed.

Prioritize future work in this order:

1. **Nemotron as a separate streaming backend**, once its CoreML artifacts have
   a reproducible download path and a Node bridge exists. It addresses a new
   capability instead of duplicating the current batch backends.
2. **Qwen3-ASR 0.6B CoreML as a compact accuracy candidate**, once it can run
   through Node and publish comparable five-language results.
3. **Cohere Transcribe as a batch accuracy candidate** only if its CoreML
   language coverage and long-form integration mature enough to beat Whisper
   in the canonical harness.

## Consequences

- Backend selection and user-facing model names remain truthful: every listed
  backend is installable and executable through the Node API.
- Published benchmark numbers continue to compare the same end-to-end stack.
- cuttledoc does not gain streaming in this change.
- The first future implementation cost is explicit: build or adopt a maintained
  Node bridge around the relevant FluidAudio manager before changing cuttledoc.
- Nemotron redistribution must retain the OpenMDW-1.1 notice and NVIDIA
  attribution; it must not be described as Apache-2.0 or MIT.

## Revisit triggers

Re-run this evaluation when any of these conditions is met:

- FluidAudio or another maintained package publishes a Node-compatible API for
  Cohere, multilingual Nemotron, or Qwen3-ASR.
- Nemotron's CoreML artifacts become publicly and non-interactively available.
- A candidate publishes reproducible EN/DE/FR/ES/PT FLEURS results for its
  Apple-native port.
- cuttledoc commits to a streaming transcription API.
