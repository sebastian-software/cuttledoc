# ADR-0013: Select the transcript-enhancement model before its embedded runtime

## Status

Accepted

## Context

Cuttledoc can optionally improve transcript punctuation, capitalization,
structure, and carefully bounded recognition errors. Cuttledoc 2 used Ollama,
while v3 must also permit remote providers and may eventually embed an
Apple-local model. The embedded decision must not leak into the public task API
or be inherited accidentally from the selected speech-recognition runtime.

Issue #7 compared local runtime options and ran Qwen3 0.6B through a pinned
official-MLX reference path. The runtime loaded quickly, streamed tokens,
repeated deterministically, and cancelled cooperatively. The deliberately tiny
model nevertheless changed `fielen` to `fiel` under a no-lexical-change prompt,
so the external policy gate correctly rejected it. That result establishes
runtime feasibility and a safety mechanism; it does not compare representative
model quality and cannot select either a model or a product runtime.

Gemma 4 E2B, Qwen 3.5 0.8B, and SmolLM3 3B are materially different quality,
size, architecture, and multilingual tradeoffs. Core ML can execute stateful
autoregressive models and quantized weights on current Apple platforms; it is
not restricted to small models. Official MLX remains a strong Apple-local
foundation, but the difficulty of a model-specific adapter is not a reason to
reject it, and the convenience of the existing reference probe is not a reason
to preselect it.

## Decision

Select transcript-enhancement quality before selecting the embedded runtime.
Issue #20 evaluates these candidates in order:

1. Gemma 4 E2B as the primary quality candidate;
2. Qwen 3.5 0.8B as the small efficiency challenger; and
3. SmolLM3 3B as the multilingual product-size compromise.

Retain Gemma 3n E4B through Ollama as a historical control when its exact model
artifact and provider behavior can be reproduced. Qwen3 0.6B remains a runtime
and negative-gate control, not a quality candidate.

Run the first model comparison through one pinned reference execution layer so
runtime integration does not confound model quality. Using MLX-LM over official
MLX for this phase is an experimental convenience, not the product-runtime
decision. Freeze the complete model revision, conversion, quantization, prompt
hash, decoding settings, language, domain, ASR backend, and supplied context for
every result.

After the quality bakeoff, carry the surviving model through a narrow
repository-owned C++ adapter and C ABI over official MLX. This reuses the
already accepted Apple-local runtime, safetensors delivery, and upgrade
boundary. A parallel Core ML conversion is no longer an initial implementation
gate. Reopen it only when the selected MLX path fails its memory, parity,
energy, lifecycle, or packaging gates, or when measured Neural Engine execution
offers a material product advantage.

Select or reject the product runtime using measured startup, first-token
latency, throughput, memory, artifact size, energy procedure, conversion
fidelity, streaming, cancellation, lifecycle, packaging, and maintenance cost.
Do not assume that Core ML implies Neural Engine execution.

Text generation remains a separate, provider-neutral task contract. OpenAI,
Ollama, and future embedded adapters implement `TextGenerationEngine`
independently. Transcript chunking, prompt selection, protected spans, external
diffs, policy gates, and raw/corrected retention belong to the enhancement
orchestrator above the engine.

Do not ship an initial embedded transcript-enhancement backend until one frozen
model/prompt tuple passes representative held-out quality and safety gates. This
is a shipment gate, not a deferral of the model and runtime bakeoff.

## Consequences

### Positive

- Model quality and runtime delivery are measured as separate decisions.
- MLX remains the selected first Apple-local implementation path without
  precluding a triggered Core ML comparison.
- A small but weak model cannot win solely through easy packaging or speed.
- A strong model is not rejected solely because its native adapter is harder.
- Mechanical guards, not prompt obedience, define the correction safety
  boundary.
- OpenAI and Ollama can progress without waiting for an embedded decision.

### Negative

- The work still requires a model-specific graph, cache, and native adapter
  after reference quality selection.
- An official-MLX backend still requires Cuttledoc to own a model-specific graph,
  cache, task ABI, and upgrade tests.
- Initial v3 still needs explicit memory and packaging qualification before
  bundling offline enhancement.

## Validation

The runtime foundation is backed by the
[`Apple-local text-generation evaluation`](../text-generation-runtime-evaluation.md),
the pinned
[`MLX reference probe`](../../spikes/text-generation-mlx-reference/README.md),
and its negative validator self-test. The measured 351 MB Qwen3 0.6B snapshot
loaded in 428.4 ms, produced its first token in 197.1 ms, generated at 270.1
tokens/s, repeated with identical text and token IDs, and stopped cooperatively
after four tokens. Its rejected lexical edit demonstrates why that evidence is
not a model-quality decision.

Issue #20 and the
[`transcript-enhancement model bakeoff`](../transcript-enhancement-model-bakeoff.md)
define the corrective experiment. Independent professional podcast and
audiobook sources remain appropriate for later release-quality claims; they
are no longer an implementation-selection gate.

ADR-0014 now records the accepted local-first product direction: Gemma 4
26B-A4B 4-bit is the local model, Gemini 3.6 Flash is the explicit hosted
quality option, and official MLX is the initial embedded implementation path.
The synthetic development screen supports that implementation choice but does
not establish universal podcast or audiobook accuracy.

The first issue-#20 development matrix is complete. Across the three frozen
prompts, Gemma returned two no-ops and one fenced structured response that the
strict parser rejected; Qwen returned one no-op plus unsupported three- and
four-edit rewrites; SmolLM3 returned two no-ops and one harmful surface-only
edit. All candidates executed and repeated deterministically, but none showed a
verified quality gain. This confirms the decision to defer model-specific Core
ML and owned-MLX product work until human-verified held-out evidence identifies
a survivor.

The subsequent hosted capability screen reinforces rather than changes this
decision. Under provider-pinned, no-fallback ZDR routes and a strict gateway
JSON Schema, Qwen 3.5 122B-A10B, GPT-5.6 Sol, and Claude Sonnet 4.6 each made
the one hidden reference-matching correction and passed the repository-owned
lexical audit. Mistral Small 3.2 24B reported an edit without applying it, and
the audit rejected the contradiction. These controls show that stronger models
can execute the task and that gateway structure is not a safety boundary. They
remain development-only remote quality ceilings: one inspected, unverified
fixture cannot select a model, and remote execution supplies no evidence for
the official-MLX versus Core ML product-runtime decision.
