# Apple-local text-generation runtime evaluation

**Status:** issue #7 runtime probe and issue #20 implementation selection
complete; ADR-0014 selects local Gemma and hosted Gemini.

**Evidence date:** 2026-07-24.

## Outcome

The pinned Qwen3 0.6B experiment proves model load, deterministic
autoregressive generation, token streaming, cooperative cancellation, and
modest delivery cost through official MLX. The same run also proves why runtime
viability and correction quality are separate gates: the deliberately small
model violated a lexical invariant and doubled the development fixture's
content error count. It cannot select the production model or runtime.

The practical decision is therefore:

1. keep raw transcription complete and usable without enhancement;
2. keep `TextGenerationEngine` independent of STT, TTS, and inference runtime;
3. allow OpenAI and Ollama adapters to be implemented independently behind
   that contract;
4. implement Gemma 4 26B-A4B 4-bit as the local-first model through a narrow
   repository-owned adapter over official MLX;
5. expose Gemini 3.6 Flash only through explicit OpenRouter configuration; and
6. keep enhancement off on machines without sufficient local memory unless the
   user deliberately selects the hosted option.

MLX-LM over official MLX remains the pinned reference layer. It is not a product
dependency; the selected embedded path owns its task graph and C ABI directly
over official MLX. See the
[`transcript-enhancement model bakeoff`](transcript-enhancement-model-bakeoff.md).

## Representative-candidate development result

The issue-#20 Stage-A matrix has now executed Gemma 4 E2B, Qwen 3.5 0.8B, and
SmolLM3 3B through the same pinned official-MLX reference environment. All
three load, stream, cancel cooperatively, and repeat deterministically. None is
yet a quality winner on the single German audiobook development fixture:

| Candidate | Snapshot | Load | First token, conservative prompt | Generation | Peak MLX / process RSS | Quality observation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Gemma 4 E2B 4-bit | 3.58 GB | 1.95 s | 494 ms | 106 tok/s | 3.32 / 7.37 GB | Unchanged under two prompts; fenced JSON rejected under the structured prompt |
| Qwen 3.5 0.8B 4-bit | 652 MB | 1.25 s | 376 ms | 251 tok/s | 1.40 / 1.64 GB | Fast and compact, but produced four unaudited lexical changes under the structured prompt |
| SmolLM3 3B 4-bit | 1.75 GB | 912 ms | 827 ms | 121 tok/s | 2.40 / 3.89 GB | Structured contract passed with a no-op; a separate surface-only run made one harmful edit |

These are warm-host process observations; OS file and Metal caches were not
cleared. Gemma's conversion also contains multimodal towers, so its snapshot is
not a text-only architecture comparison. The measurements can screen delivery
cost, but the unverified, development-exposed one-error fixture cannot rank
correction quality. Consequently neither an owned official-MLX adapter nor a
Core ML conversion has been started for these models. The next justified step
is held-out human-verified German professional audio, not premature runtime
porting.

## Hosted quality-ceiling result

The separate
[`OpenRouter quality reference`](../spikes/text-generation-openrouter-reference/README.md)
ran Qwen 3.5 122B-A10B, Mistral Small 3.2 24B, GPT-5.6 Sol, and Claude Sonnet
4.6 in its initial historical matrix against the same hidden-reference German
development fixture. Qwen, GPT, and Claude each applied and reported the one
reference-matching lexical correction; Mistral reported a different edit but
failed to apply it to its text, so the external audit rejected the result.
Claude produced the narrowest accepted response and the only identical
accepted repeat.

These are remote quality controls, not Apple-local runtime measurements.
Provider fallbacks were disabled and ZDR routes were pinned, but hosted model
artifacts remain opaque and client-observed request time includes the gateway,
network, queue, and provider. The $0.05134114 recorded final matrix establishes
an inexpensive development ceiling; it provides no MLX/Core ML latency,
memory, energy, packaging, or model-size evidence and still cannot select
quality from one inspected, unverified fixture.

The later multi-page screen adds Gemini 3.6 Flash, Kimi K3, GPT-5.6 Terra,
GPT-5.6 Luna, and Claude Sonnet 5. Sonnet 5 replaces 4.6 as the active Anthropic
control; the old result remains only for reproducibility. Kimi and Sonnet 5
pass the full bounded contract without a section regression. Gemini reaches
0.90% diagnostic WER but changes a correct `Industrie 5.0` to `Industrie 4.0`;
Terra reaches 2.01% without a regression, while Luna improves only one section.
Qwen3.7 Max reaches 1.51% without a section regression under an
explicitly authorized and consumed one-execution non-ZDR exception. These
remote results refine the quality shortlist and still provide no local-runtime
evidence.

## Candidate review

The maintenance signals below are a dated snapshot, not a popularity contest.
Licensing, API width, model ownership, release discipline, platform focus,
delivery cost, and replaceability all contribute to the disposition.

| Candidate | 2026-07-21 evidence | Model and delivery implications | Disposition |
| --- | --- | --- | --- |
| [Official MLX](https://github.com/ml-explore/mlx) plus an owned model adapter | Apple-maintained MIT project; about 27.6k stars; v0.32.0 released 2026-07-07; current macOS/Metal work. [MLX-LM](https://github.com/ml-explore/mlx-lm) is the official reference implementation, with about 6.4k stars and v0.31.3. | MLX safetensors fit the existing verified model-cache design and reuse the already accepted MLX runtime foundation. Cuttledoc still owns the model graph, architecture-specific cache, task ABI, lifecycle, and upgrade tests. | Selected first embedded path for Gemma. `mlx-lm` and Python remain reference-only; the product path uses a narrow owned C++/C ABI over official MLX. |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | Mature MIT project; about 121k stars; frequent numbered builds; Apple Silicon/Metal, GGUF, a C API, CLI, and local server are first-class paths. | Strong model availability and portable delivery, but GGUF creates a second model format and cache alongside the MLX safetensors already needed by Cuttledoc. It also adds another native runtime to build, sign, test, and update. | Credible fallback. Promote if cross-platform embedded inference or GGUF distribution becomes more valuable than one Apple-local runtime foundation. |
| [mistral.rs](https://github.com/EricLBuehler/mistral.rs) | Active MIT Rust project; about 7.5k stars; v0.9.0 released 2026-07-07; Metal, safetensors, GGUF/UQFF, Rust SDK, servers, multimodal and agent features. | Capable, but its broad runtime and feature surface are disproportionate to Cuttledoc's narrow correction task. Adoption would add a large second ownership and dependency surface instead of reusing official MLX. | Reference only. Re-evaluate only if its Rust-native lifecycle or supported model produces a measured advantage large enough to pay for the surface. |
| [Candle](https://github.com/huggingface/candle) | Established Apache-2.0/MIT Rust framework; about 20.7k stars; active Metal kernels and safetensors/GGUF support; no GitHub release stream at the snapshot. | Cuttledoc would own or closely track model-specific implementations as well as the runtime integration. Current model coverage is not a stable task-level compatibility promise. | Reference only. Useful implementation prior art, not an initial embedded dependency. |
| [Core ML](https://apple.github.io/coremltools/docs-guides/source/stateful-models.html) | Apple supports stateful models, KV-cache-style state, and compressed weights on current platforms; the framework itself is mature and system-delivered. | Requires a maintained converted model, conversion validation, compiled artifacts, and model-specific state mapping. Compute placement is graph- and device-dependent; Core ML does not imply Neural Engine execution. | Triggered alternative only. Reconsider when MLX fails a material product gate or measured Core ML execution offers a meaningful delivery advantage. |
| Ollama HTTP adapter | Existing Cuttledoc 2 behavior and a pragmatic local-process provider boundary. | Ollama owns process lifecycle and its model cache. Cuttledoc owns provider configuration, request cancellation, errors, and capability mapping, but does not embed the runtime. | Independently implementable local provider; not the embedded runtime decision. |
| OpenAI HTTP adapter | Remote model access without local native runtime or model delivery. | No local model cache. Credentials, privacy, cost, network errors, rate limits, cancellation, and opaque model revisions remain provider concerns. | Independently implementable remote provider; not coupled to Ollama or an embedded backend. |

No weak project enters a Cargo, npm, native build, or release manifest as a
result of this evaluation. The initial quality comparison adds only a locked,
disposable Python reference environment; it does not preselect the embedded
runtime.

## Pinned experiment

The runnable probe is in
[`spikes/text-generation-mlx-reference`](../spikes/text-generation-mlx-reference/README.md).
It pins:

- `Qwen/Qwen3-0.6B` and the exact
  `mlx-community/Qwen3-0.6B-4bit` conversion, both Apache-2.0;
- a 351,383,618-byte verified MLX model snapshot;
- official MLX 0.32.0 and MLX-LM 0.31.3;
- greedy, non-thinking generation with seed zero;
- `surface-only-v1` by SHA-256; and
- one German professionally narrated audiobook development fixture whose
  evaluation reference is never rendered into the prompt.

The conversion identifies the official Qwen model family but does not name
the exact upstream source commit it converted. The manifest therefore pins an
observed official source revision for capability and license evidence without
claiming that it was the conversion input.

The model was intentionally small enough to make runtime integration cheap.
It is not proposed as the production correction model.

| Measurement | Result |
| --- | ---: |
| Fresh-process model load, without clearing OS/Metal caches | 428.4 ms |
| First generated token | 197.1 ms |
| Complete generation | 431.8 ms |
| Generation throughput | 270.1 tokens/s |
| Prompt / generated tokens | 269 / 61 |
| Process peak resident size | 1,028,030,464 bytes |
| MLX peak allocation | 669,108,360 bytes |
| Model snapshot | 351,383,618 bytes |
| Deterministic repeat | identical text and token IDs |
| Cooperative cancellation | stopped after four tokens in 158.6 ms; process remained usable |

The output changed `fielen` to `fiel` despite a hard no-lexical-change rule.
The external gate rejected it. On the unverified development transcript, WER
moved from one error in 39 words (2.56%) to two (5.13%). The model also failed
to add useful punctuation. This is not a population-quality result, but it is
enough to reject this exact model/prompt tuple and demonstrate that prompt
instructions alone are not a safety boundary.

The complete machine-readable result is
[`phase5.qwen3-0.6b-4bit-mlx-reference.issue7-de-audiobook-whisper-1.json`](../benchmarks/postprocessing/runs/phase5.qwen3-0.6b-4bit-mlx-reference.issue7-de-audiobook-whisper-1.json).

## Model-format and cache consequences

| Backend | Artifact ownership | Cache consequence |
| --- | --- | --- |
| Official MLX adapter | Cuttledoc manifest plus immutable MLX safetensors | Reuses the existing download, digest, rollback, and MLX runtime strategy. Model weights remain task/model-specific; “shared runtime” does not imply shared weights. |
| llama.cpp | Cuttledoc or provider-managed GGUF | A second representation is normally required even for the same source model. Do not silently keep both MLX and GGUF copies. |
| mistral.rs / Candle | Cuttledoc-managed safetensors, GGUF, or runtime-specific quantization | Format flexibility increases the compatibility and validation matrix rather than removing it. |
| Core ML | Cuttledoc-managed compiled model plus conversion provenance | Separate platform-specific artifacts, conversion toolchain, and rollback evidence. |
| Ollama | Provider-managed | Discover capability and model identity, but do not mutate or claim ownership of Ollama's cache. |
| OpenAI | Remote provider | No local artifact; retain provider/model request identity in diagnostics. |

The cache key remains `provider + model identity + immutable revision + artifact
digest + format`. A friendly model name is never enough to reuse an artifact
across runtimes.

## Quality gate before selecting embedded work

The model-quality proposal must freeze a complete
`model + revision + quantization + prompt + decoding` tuple and test it per
language and domain. German remains first, followed by English, Spanish,
French, and Portuguese. Professional podcast and audiobook recordings are the
target domain; synthetic round trips remain diagnostic only.

At minimum, the quality stage reports content WER/CER, surface improvements,
edit precision, transcript-level regression rate, protected-content and
contract violations, plus enough latency, memory, and size data to identify
impractical candidates. Raw text is always retained. No aggregate gain may hide
a regression in a product-priority language cell or a critical change to a
name, number, date, unit, technical term, or negation.

Only a quality survivor proceeds to the MLX/Core ML comparison. That stage
adds conversion parity, actual compute placement, first-token latency,
throughput, load, memory, model and artifact size, energy procedure,
cancellation, lifecycle, and repeated determinism.

## Replacement boundary

The product boundary is `TextGenerationEngine`, not MLX, GGUF, Ollama, or an
OpenAI response type. Transcript chunking, prompt selection, audit diffs,
mechanical guards, and raw/corrected result retention live in the enhancement
orchestrator above the engine. The engine only owns model/provider execution,
ordered text deltas, supported generation options, cancellation, and lifecycle.

That separation lets future official-MLX, Core ML, and llama.cpp adapters plus
Ollama and OpenAI providers coexist or replace one another without changing STT
or TTS contracts.
