# ADR-0014: Local-first transcript-enhancement defaults

## Status

Accepted

## Context

Cuttledoc needs a small, understandable transcript-enhancement product surface.
The raw transcription is already local by default, so silently adding a hosted
correction step would weaken the product's privacy and offline-first properties.
At the same time, the completed model screens show that a capable language model
can materially improve the selected multilingual development transcripts.

On the frozen five-language synthetic development challenge, raw transcription
had 6.56% macro WER. Gemma 4 26B-A4B 4-bit reduced it to 5.12%, while Gemini
3.6 Flash reduced it to 4.17%. The smaller Gemma 4 E2B configuration did not
provide a reliable useful correction tier. The 26B-A4B 4-bit snapshot is about
15.4 GB, which makes memory capacity a product constraint rather than a
packaging detail.

The hosted follow-up also tested prominent alternatives. None of Grok 4.5,
Claude Opus 5, GLM-5.2, DeepSeek V4 Pro, or GPT-5.6 Luna beat Gemini in the
selected German/English comparison or justified another dedicated product
mode.

## Decision

Cuttledoc uses a local-first transcript-enhancement policy:

1. The intended default pipeline transcribes locally and applies local
   enhancement with Gemma 4 26B-A4B 4-bit when the machine passes the eventual
   memory capability check.
2. Cuttledoc recommends at least 32 GB of unified memory for this local
   enhancement path. This is a product recommendation pending a direct 32 GB
   hardware smoke test, not a claim that every 32 GB workload is safe.
3. If the machine does not have sufficient headroom, enhancement remains off.
   Cuttledoc does not substitute the rejected smaller local models.
4. Gemini 3.6 Flash is the dedicated hosted quality option. It is enabled only
   when the user explicitly selects it and configures an OpenRouter API key.
   Local resource limits never trigger an automatic hosted fallback.
5. The raw transcript is always retained. Invalid responses and edits that
   exceed the correction policy fall back to the raw text.
6. The initial product surface does not expose dedicated Opus, GPT, Grok, GLM,
   Kimi, Qwen, or DeepSeek enhancement modes. A future provider-neutral custom
   model escape hatch is a separate product decision.

The completed Gemma evidence was produced through a pinned MLX reference. The
initial embedded implementation should therefore continue through the planned
repository-owned adapter over official MLX. ADR-0013's runtime, conversion,
interop, packaging, and parity gates still apply before that adapter becomes a
shipped product backend.

## Consequences

- The normal capable-machine path stays local, private, and usable without
  per-request API cost.
- Gemini remains available when a user explicitly prefers the stronger measured
  quality over local execution and accepts remote processing.
- Machines below the local memory recommendation receive raw transcription
  rather than a weak correction model or an unexpected cloud request.
- The orchestrator must release heavyweight transcription resources before
  loading Gemma and must keep enough system headroom for the operating system
  and application.
- The product must distinguish the raw and enhanced texts and make the raw
  result accessible.
- Supporting local enhancement on lower-memory machines would require a new
  model to pass the same quality and correction-policy gates.

## Validation and review triggers

Before calling the local path generally available, run an end-to-end memory and
output-parity smoke test on a 32 GB Apple Silicon machine with sequential STT
and enhancement lifecycles. Revisit this decision if a materially smaller local
model reaches comparable quality, the Gemma artifact or license changes, or a
hosted model produces a clear quality, safety, or operational advantage over
Gemini.

The benchmark is a selected synthetic development challenge. It supports model
and product-mode selection but does not establish universal podcast or
audiobook accuracy.

## References

- [ADR-0013](0013-select-transcript-enhancement-model-before-embedded-runtime.md)
- [Transcript postprocessing evaluation](../postprocessing-evaluation.md)
- [Factorial transcript-postprocessing benchmark](../postprocessing-factorial-benchmark.md)
- [Local upscale-model decision](../../benchmarks/postprocessing/local-llm-upscale-challenger-decision.json)
- [Hosted German/English comparison](../../benchmarks/postprocessing/hosted-llm-de-en-prominent-comparison.json)
