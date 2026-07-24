# Factorial transcript-postprocessing benchmark

**Status:** all three local TTS/STT slices and the hardened Gemma contract
screen are complete.

**Evidence date:** 2026-07-23.

This benchmark compares transcript postprocessing under controlled variation in
language, source text, speech synthesis, voice, generation, speech recognition,
and language model. It replaces one-dimensional model screens with a paired
factorial design while retaining an explicit limit: synthetic clean speech can
select development survivors, but it cannot establish release quality on human
podcasts or audiobooks.

The machine-readable plan is
[`factorial-plan.json`](../benchmarks/postprocessing/factorial-plan.json). The
complete execution ledger is generated deterministically as
[`factorial-cells.json`](../benchmarks/postprocessing/factorial-cells.json).

## Locked primary matrix

| Axis | Locked values | Replication |
| --- | --- | ---: |
| Language | `de-DE`, `en-US`, `es-419`, `fr-FR`, `pt-BR` | 5 |
| Content | technical, native factual, dialogue | 3 |
| Independent source passages | separately pinned texts within each language/content cell | 2 |
| TTS | Apple AVSpeechSynthesizer, Qwen3-TTS 1.7B VoiceDesign, Voxtral 4B TTS BF16 | 3 |
| Voice | engine-specific voice identities within each language | 2 |
| Primary generation | engine-specific realizations described below | 2 |
| STT | Whisper large-v3-turbo, direct Qwen3-ASR 0.6B/MLX, Parakeet TDT 0.6B v3 | 3 |
| Hosted postprocessor | GPT-5.6 Sol, Gemini 3.6 Flash, GPT-5.6 Terra, Kimi K3, Claude Sonnet 5 | 5 |
| Hosted repeat | identical prompt, fixture, model, and pinned provider | 2 |

The two passages are source replication, not two excerpts from one synthesized
recording. They prevent one unusually easy paragraph from defining an entire
content type. The two voices expose speaker and presentation sensitivity. The
two generation realizations expose synthesis variance, and the two LLM repeats
expose hosted-response variance. These dimensions remain separate in every
record.

## Seed and repeat semantics

A nominal `seed=0,1` loop would not mean the same thing for all three TTS
engines. The locked contract therefore records engine semantics instead of
pretending the APIs are identical:

- Apple exposes no generation seed. Two independent calls with the same pinned
  installed voice measure host/runtime output stability.
- Qwen VoiceDesign uses the seed as part of the generated voice identity. Each
  of the two voice slots has its own fixed instruction and identity seed; two
  calls reuse that exact identity.
- Voxtral uses a pinned voice preset. Seeds 0 and 1 create the two primary
  realizations without changing the preset.
- Voxtral also receives one extra seed-0 generation for both voices on the
  first technical passage in every language. These ten audio files are a
  same-seed reproducibility control and do not enter the LLM matrix.

Every stochastic input, identity seed, repeat number, and random execution
order is stored. A `repeat` is never silently substituted for a missing source
passage or voice.

## Derived workload

| Artifact or unit | Count |
| --- | ---: |
| Passage slots | 30 |
| Voice slots | 30 |
| Primary audio artifacts | 360 |
| Voxtral same-seed control audio | 10 |
| Total STT transcripts | 1,110 |
| Six-section LLM documents | 180 |
| Document/model pairs | 900 |
| Provider requests after two repeats | 1,800 |
| Primary section-level model outputs | 5,400 |
| Section-level repeat observations | 10,800 |

Each LLM document groups the six passages for one language, TTS engine, voice,
primary realization, and STT model. The sections remain independently scored,
but the model receives realistic multi-page context. The hidden source text is
never included in the prompt.

The 10,800 section observations are not 10,800 independent samples. The same
30 source passages occur under multiple voices, realizations, recognizers, and
postprocessors. Reports therefore keep passage and source identity, publish
per-language results, use language-level macro averages instead of pooling all
words, and use source-grouped confidence intervals. Repeats estimate variance;
they do not inflate the source sample count.

## Prompt and local audit

The matrix uses
[`conservative-sections-local-diff-v2.txt`](../benchmarks/postprocessing/prompts/conservative-sections-local-diff-v2.txt).
The model returns only immutable section ids and complete corrected section
texts. It does not author an edit ledger, reasons, or confidence scores.

The repository derives the authoritative input/output lexical diff, checks
protected spans, computes section and aggregate WER, and retains every raw
response. This removes the bookkeeping failure seen when otherwise strong
models omitted or duplicated ledger entries. It does not weaken the quality
gate: unsupported changes to correct names, numbers, dates, units, terms, or
negations are counted as harmful edits and reviewed independently of aggregate
WER.

## Execution gates

The primary matrix cannot start until all of the following are true:

1. All 30 passage slots remain materialized, revision- and digest-pinned,
   rights-reviewed, and appropriate for their declared content type.
2. Every Apple host voice identifier is resolved and every Qwen/Voxtral voice
   slot passes the digest-pinned catastrophic technical gate. Listening remains
   a useful optional diagnostic, not a blocker for the synthetic baseline.
3. Each generated master is retained losslessly, digest-pinned, and normalized
   once. All three STT models receive exactly the same normalized PCM.
4. All raw STT transcripts and LLM responses have durable paths before remote
   execution begins.
5. A dry-run token and cost estimate based on the completed multilingual
   documents is reviewed and an explicit budget is approved.

The current selection contains 35 passages from 21 pinned sources. Thirty
passages fill the factorial cells; five earlier German and English calibration
passages remain available outside the locked matrix. Every language/content
cell now has two independently digest-pinned texts. German and English use two
technical passages already in the calibration corpus, while the second factual
passages come from different article sections and the second dialogues are new
repository sources. The Spanish, French, and Portuguese candidates are
accepted for the baseline without a mandatory native-language review. If an
execution exposes wording, regional-variety, or dialogue-idiom problems, a
future corpus revision can correct them without invalidating the pinned
baseline results.

Spanish `es-ES` and Portuguese `pt-PT` Voxtral presets remain explicitly
labeled regional proxies for the `es-419` and `pt-BR` text cells. This limits
how broadly their results may be generalized, but does not block execution.

## Remote execution and cost boundary

Every hosted candidate remains pinned to one provider, with fallback disabled,
required parameters enabled, denied data collection, and ZDR required. The
consumed one-time non-ZDR Qwen3.7 Max exception is not part of this matrix.

Using the recorded cost of the current 995-word German document as a reference,
five models and two requests cost approximately `$0.714417` per future
document. Applied to 180 documents, the provisional total is `$128.59506`.
This is a projection, not authorization: multilingual tokenization, future
document length, and provider pricing may change it.

Requests are assigned to two deterministic randomized blocks. Each block
contains every one of the 900 document/model pairs exactly once. This prevents
selectively omitting expensive or failed cells after observing results and
keeps a stopped block balanced. A partial block is not a completed benchmark,
and the second block remains required for the planned repeat analysis.

## Decision and reporting boundary

Primary metrics are raw and postprocessed WER, relative error reduction,
harmful-edit rate on correct input spans, section-regression rate, proper-name
recall, number/date/unit recall, technical-term recall, and presentation-only
changes. Results are reported by language, content type, passage, TTS engine,
voice, realization, STT model, and LLM model before any macro summary.

The synthetic matrix may remove weak or unsafe development candidates and
identify language-specific defaults. A frozen survivor still requires unseen,
human-verified professional podcast or audiobook audio before a release claim.
The user-facing product may continue to expose multiple STT engines even when
one becomes the default.

Validate the complete design and regenerate/check the ledger with:

```sh
node scripts/generate-postprocessing-factorial-matrix.mjs --check
node scripts/validate-postprocessing-factorial-plan.mjs --self-test
node spikes/text-generation-openrouter-reference/run_reference.mjs --self-test
```

## Resumable local execution

The local TTS and STT stages write large, host-specific artifacts below the
ignored `artifacts/postprocessing-factorial-local` directory by default. The
runner verifies all 30 materialized passages before creating state, records
host capabilities, resolves Apple voice identifiers from the installed voice
inventory, and treats every audio unit as an independently digest-pinned
checkpoint. A valid existing checkpoint is resumed rather than regenerated.

Initialize and inspect the local run with:

```sh
node scripts/run-postprocessing-factorial-local.mjs init
node scripts/run-postprocessing-factorial-local.mjs resolve-voices
node scripts/run-postprocessing-factorial-local.mjs status
```

Run one qualification artifact per resolved Apple voice before expanding the
full Apple slice:

```sh
node scripts/run-postprocessing-factorial-local.mjs run-apple-tts \
  --qualification-only
```

Transcribe every locally completed qualification artifact through the three
locked STT engines. Whisper engines are reused per language, Parakeet is reused
across languages, and the repository-owned direct Qwen adapter runs against the
same persisted normalized PCM digest:

```sh
node scripts/run-postprocessing-factorial-local.mjs run-stt \
  --qualification-only --backend all
node scripts/run-postprocessing-factorial-local.mjs summarize-qualification
```

The summary command keeps raw audio and transcripts in the ignored artifact
directory, but writes a compact, digest-pinned qualification report to
`benchmarks/postprocessing/qualifications`. This first gate only detects broken
or unintelligible synthesis before expansion. It deliberately retains
recognizer disagreement and does not turn a single synthetic passage into an
engine ranking or a claim about human podcast and audiobook quality.

The Qwen VoiceDesign qualification uses the same ten-cell slice. Its batch
worker verifies the pinned BF16 snapshot once, loads the MLX model once, then
checkpoints every voice independently before the shared normalization and STT
stages:

```sh
node scripts/run-postprocessing-factorial-local.mjs run-qwen-tts \
  --qualification-only
node scripts/run-postprocessing-factorial-local.mjs run-stt \
  --qualification-only --backend all
node scripts/run-postprocessing-factorial-local.mjs summarize-qualification \
  --engine qwen
```

Qwen repeats reuse the voice slot's identity seed exactly. Long inputs use the
pinned `sentence-aware-adaptive-v2` policy: it prefers sentence boundaries
after 45 words, enforces a hard 55-word limit, resets the qualified identity
seed for every chunk, and inserts 250 ms of silence between chunks. Every chunk
must finish normally below the 1,200-token ceiling. A pathological chunk that
hits the ceiling is deterministically bisected and retried down to four words;
if it still cannot finish, the complete audio unit fails instead of silently
turning missing speech into STT errors.

If a pinned Qwen identity fails that gate, the recovery plan tests the next
three seeds without changing its description. It selects the first seed that
finishes and stays below the direct-Qwen receiver threshold, rather than
choosing the lowest WER after observing all candidates:

```sh
node scripts/run-postprocessing-factorial-local.mjs run-qwen-recovery
```

The recovery result is only a proposal for a factorial-plan revision. The
selected identities still have to rerun the complete three-receiver
qualification under that new revision before the full slice can expand.

Plan revision 4 applied the bounded recovery result: `qwen-de-clear` moved
from identity seed 1 to 2 and `qwen-es-clear` from seed 1 to 3. The other eight
Qwen slots passed the first three-receiver gate. The complete revision-4
rerun then passed all ten identities without a token-limit failure. Plan
revision 5 consequently marks every Qwen slot qualified and makes all 120
Qwen audio cells ready; Apple host voices and the exact Voxtral BF16 artifact
remain separate execution gates.

Plan revision 6 also promotes the ten Apple voices that passed the local
three-receiver screen. Their exact AVSpeechSynthesizer identifiers and actual
installed locales are pinned in the plan; cross-region voices remain visible
as such instead of being relabeled as `es-419`, `fr-FR`, or `pt-BR`. A host
must expose those exact identifiers before the Apple slice can run.

The Voxtral path verifies the complete 8.04 GB BF16 snapshot against the
repository manifest before one model load serves a resumable batch. Each
passage uses deterministic sentence-aware chunks, resets its generation seed
per chunk, and fails closed if adaptive splitting cannot avoid the 1,200-token
ceiling. Seed 0 on the first technical passage forms the ten-voice
qualification slice; seed 1 remains a distinct primary realization rather
than being mistaken for a repeat.

```sh
bash scripts/fetch-voxtral-tts-mlx-bf16-model.sh \
  /tmp/cuttledoc-voxtral-tts-4b-mlx-bf16
node scripts/run-postprocessing-factorial-local.mjs run-voxtral-tts \
  --qualification-only \
  --output-dir artifacts/postprocessing-factorial-local-plan-6
node scripts/run-postprocessing-factorial-local.mjs run-stt \
  --qualification-only --backend all \
  --output-dir artifacts/postprocessing-factorial-local-plan-6
node scripts/run-postprocessing-factorial-local.mjs summarize-qualification \
  --engine voxtral \
  --output-dir artifacts/postprocessing-factorial-local-plan-6
```

All ten Voxtral presets passed this screen with no non-finite samples, token
caps, or adaptive retries. The ten qualification recordings total 598.18
seconds. Mean channel WER is 4.38% for Whisper, 5.59% for direct Qwen3-ASR, and
11.97% for Parakeet. The all-receiver locale means are 6.80% German, 6.70%
English, 7.32% Spanish, 6.40% French, and 9.35% Portuguese. The Spanish female
cell exposes useful receiver disagreement—1.91% Whisper versus 14.01% Qwen and
18.47% Parakeet—but passes because the gate requires at least one intelligible
receiver and deliberately does not convert disagreement into a TTS rejection.
These figures qualify the presets for expansion; they are not an engine
ranking.

After all 120 audio and 360 STT artifacts for one engine are present, create a
compact repository report while leaving raw PCM and transcripts ignored:

```sh
node scripts/run-postprocessing-factorial-local.mjs summarize-slice \
  --engine apple \
  --output-dir artifacts/postprocessing-factorial-local-plan-6
```

The report retains every cell's digests and WER/CER, publishes language,
content, voice, and recognizer strata, and separately measures whether the two
generation repeats produced identical audio and transcripts.

## Current complete local slices

Plan revision 6 has complete Apple, Qwen VoiceDesign, and Voxtral BF16 slices.
The values below are macro mean channel WER percentages: they measure the
complete TTS-to-STT path and must not be presented as isolated STT accuracy.

| TTS source | STT receiver | Overall | German | English | Spanish | French | Portuguese |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Apple | Whisper | 3.32 | 4.39 | 2.18 | 2.48 | 3.15 | 4.38 |
| Apple | Qwen3-ASR | 8.60 | 12.90 | 7.65 | 4.49 | 5.93 | 12.04 |
| Apple | Parakeet | 7.56 | 8.48 | 10.21 | 3.08 | 6.74 | 9.31 |
| Qwen VoiceDesign | Whisper | 2.18 | 1.91 | 2.22 | 1.29 | 2.58 | 2.92 |
| Qwen VoiceDesign | Qwen3-ASR | 7.59 | 7.59 | 5.71 | 7.28 | 4.67 | 12.69 |
| Qwen VoiceDesign | Parakeet | 7.91 | 4.65 | 5.10 | 10.63 | 7.17 | 12.02 |
| Voxtral BF16 | Whisper | 3.14 | 3.08 | 4.36 | 2.10 | 2.81 | 3.34 |
| Voxtral BF16 | Qwen3-ASR | 7.76 | 8.64 | 6.55 | 8.47 | 5.55 | 9.58 |
| Voxtral BF16 | Parakeet | 9.83 | 7.95 | 10.27 | 12.77 | 10.15 | 8.00 |

Across all three receivers, Apple has 6.49% macro mean WER, Qwen has 5.89%,
and Voxtral has 6.91%. That aggregate hides material reversals by language and
receiver, so the language strata remain the selection evidence. The Apple and
Qwen slices produced 60/60 identical normalized repeat pairs and 180/180
identical transcript pairs. Voxtral's separate same-seed control produced
10/10 identical normalized audio pairs and 30/30 identical transcript pairs.

Qwen emitted 418 successful chunks across 120 documents; two documents needed
one deterministic adaptive retry each, no document remained capped, and the
largest successful chunk used 441 of the allowed 1,200 tokens. Voxtral emitted
416 successful chunks across its 120 primary documents with no retry or cap;
its largest successful chunk used 450 tokens. The three local slices now
provide all 180 six-section documents required by the downstream LLM matrix.

The runner retains both the engine-native mono `f32le` master and one derived
16 kHz mono `f32le` normalization. The normalized digest is the single input
that all STT engines must share. Qwen and Voxtral execution is enabled only
when the exact model format pinned by the factorial plan is present; an older
or differently quantized local snapshot is reported as unavailable rather
than substituted silently.

## Local LLM screen

The three pinned MLX text-generation candidates are evaluated as a local
development screen alongside, not in place of, the locked five-model hosted
matrix. The local contract is recorded in
[`local-llm-screen.json`](../benchmarks/postprocessing/local-llm-screen.json).
It applies Gemma 4 E2B, Qwen 3.5 0.8B, and SmolLM3 3B to the 120 currently
available Apple and Qwen six-section documents, twice each. That produces 720
local requests while preserving the same hidden-reference and local-diff
rules as the hosted comparison.

Materialize the six-section documents from the digest-checked STT checkpoints:

```sh
node scripts/run-postprocessing-factorial-local-llm.mjs materialize
node scripts/run-postprocessing-factorial-local-llm.mjs status
```

Run one resumable candidate or all three. The worker verifies the exact model
snapshot before loading it once for the complete selected batch, retains every
raw response, and rejects missing, reordered, or duplicate section ids:

```sh
node scripts/run-postprocessing-factorial-local-llm.mjs run \
  --candidate qwen3.5-0.8b-4bit-mlx
node scripts/run-postprocessing-factorial-local-llm.mjs run --candidate all
node scripts/run-postprocessing-factorial-local-llm.mjs summarize
```

`--locale`, `--limit`, and `--repetitions` provide bounded diagnostic slices;
they do not change the locked full-screen counts. Gemma remains
evaluation-only pending its explicit product-rights disposition, and mlx-lm
remains the quality-reference runtime rather than a product dependency. The
summary keeps strict contract compliance separate from diagnostic recovery:
for example, JSON inside a prohibited Markdown fence can be inspected for the
cause of a failure, but it never contributes to accepted postprocessed WER.
The same applies when a model changes every immutable hyphenated section id to
the corresponding underscore form: exact one-to-one normalization may support
a diagnostic quality calculation, but the request remains rejected.

### Completed local results

The Apple/Qwen local screen is complete: all 720 requests and 4,320 section
observations are recorded in
[`local-llm-screen-results.json`](../benchmarks/postprocessing/local-llm-screen-results.json).
All 360 model/document repeat pairs produced byte-identical raw output. The
table compares raw and postprocessed WER only on each candidate's diagnostically
available matched subset; strict failures never become accepted outputs.

| Candidate | Strictly valid | Diagnostic coverage | Matched raw → post WER | Relative error change | Improved / regressed section observations | Token caps | Disposition |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Gemma 4 E2B | 124/240 | 228/240 | 5.86% → 5.53% | 5.73% reduction | 300 / 80 | 0 | Only local survivor; contract and regression work still required |
| Qwen 3.5 0.8B | 136/240 | 236/240 | 5.81% → 5.93% | 1.96% increase | 76 / 80 | 0 | Reject as general postprocessor |
| SmolLM3 3B | 180/240 | 180/240 | 6.19% → 6.72% | 8.42% increase | 136 / 260 | 12 | Reject |

The section counts retain both TTS and LLM repetitions and therefore are not
independent sample counts. They show direction and repeat stability; source-
grouped reporting remains the decision boundary.

Gemma is the only candidate with a positive aggregate result, but it is not a
product default. Only 51.7% of its responses obeyed the exact output contract;
104 more could be inspected solely because every hyphenated section id had
been changed to its underscore equivalent, and 12 could not be safely mapped.
Across diagnostically available observations it still regressed 80 sections
and introduced errors into 12 previously correct section observations.

| Gemma locale | Strictly valid | Diagnostic coverage | Matched raw → post WER | Relative reduction |
| --- | ---: | ---: | ---: | ---: |
| German | 48/48 | 48/48 | 6.37% → 6.27% | 1.67% |
| English | 16/48 | 48/48 | 4.51% → 4.46% | 1.05% |
| Spanish | 24/48 | 48/48 | 4.80% → 4.05% | 15.52% |
| French | 28/48 | 36/48 | 4.45% → 4.23% | 4.92% |
| Portuguese | 8/48 | 48/48 | 8.83% → 8.30% | 6.05% |

The accepted-only WER is not used to rank models because contract failures are
input-dependent and would create survivorship bias. The follow-up is now
pinned as
[`local-llm-gemma-contract-screen.json`](../benchmarks/postprocessing/local-llm-gemma-contract-screen.json).
It keeps Gemma's correction policy but replaces model-visible immutable string
ids with exact integer positions `0…5`. The caller validates all six positions
and maps them back to the original ids locally. This removes the known
hyphen/underscore ambiguity without weakening missing, duplicate, or
reordered-section detection.

The screen covers all 180 Apple, Qwen, and technically qualified Voxtral
documents, twice, for 360 requests and 2,160 section observations:

```sh
node scripts/run-postprocessing-factorial-local-llm.mjs materialize \
  --screen benchmarks/postprocessing/local-llm-gemma-contract-screen.json \
  --results-subdir llm-gemma-contract-results
node scripts/run-postprocessing-factorial-local-llm.mjs run \
  --screen benchmarks/postprocessing/local-llm-gemma-contract-screen.json \
  --results-subdir llm-gemma-contract-results \
  --candidate gemma-4-e2b-it-4bit-mlx
node scripts/run-postprocessing-factorial-local-llm.mjs summarize \
  --screen benchmarks/postprocessing/local-llm-gemma-contract-screen.json \
  --results-subdir llm-gemma-contract-results \
  --summary-output benchmarks/postprocessing/local-llm-gemma-contract-results.json
```

The completed report is
[`local-llm-gemma-contract-results.json`](../benchmarks/postprocessing/local-llm-gemma-contract-results.json).
Gemma returned all 360 responses without a token cap. The strict positional
parser accepted 354 (98.3%); the remaining six responses represent two
input-dependent output patterns repeated deterministically and omit the final
JSON array closure. All 180 document-level repeat pairs were byte-identical, so
the failures and quality behavior are systematic rather than sampling noise.

The positional contract fixes the earlier hyphen-to-underscore id mutation,
but contract validity alone is not a quality gate. Accepted responses have the
following macro mean WER:

| Locale | Strictly valid | Matched raw → post WER | Relative error change | Improved / regressed section observations | Correct input changed to error |
| --- | ---: | ---: | ---: | ---: | ---: |
| German | 68/72 | 5.73% → 5.70% | 0.52% reduction | 40 / 34 | 4 |
| English | 72/72 | 4.88% → 4.72% | 3.27% reduction | 60 / 30 | 0 |
| Spanish | 72/72 | 5.81% → 19.43% | 234.45% increase | 106 / 104 | 22 |
| French | 72/72 | 5.12% → 15.61% | 204.90% increase | 92 / 74 | 8 |
| Portuguese | 70/72 | 8.37% → 7.83% | 6.43% reduction | 142 / 10 | 0 |
| Overall | 354/360 | 5.97% → 10.73% | 79.70% increase | 440 / 252 | 34 |

The severe Spanish and French regressions are section cross-talk, not a scoring
artifact: in 112 accepted repeat observations Gemma changes more than 80% of
the normalized words, usually by copying a neighboring passage into the
current position. A caller-side input/output edit-rate guard detects these
gross rewrites without seeing the hidden reference. The report therefore
records an exploratory threshold sweep with invalid responses always falling
back to raw text. At a 30% maximum edit rate, micro-WER changes from 6.38% to
5.96% and all five locale aggregates improve, but 128 applied section
observations still regress and eight correct inputs still acquire an error.
That sweep is same-data development evidence, not a selected product threshold.

Gemma 4 E2B is therefore retained as a local runtime and prompt-development
candidate, but rejected as an unconditional six-section postprocessor. The
next prompt experiment should return bounded patches or process one target
section at a time while supplying neighboring text as read-only context. It
must first eliminate cross-section replacement on a frozen development slice,
then pass held-out human professional audio before any local model or edit-rate
threshold becomes a product default.

### Frozen single-target A/B screen

The follow-up is frozen in
[`local-llm-gemma-target-ab-plan.json`](../benchmarks/postprocessing/local-llm-gemma-target-ab-plan.json).
It selects ten deliberately challenging development documents: two per
language, including both malformed-JSON patterns, the strongest observed
Spanish and French section-copying cases, and German, English, and Portuguese
controls. This is rejection-oriented development evidence, not a held-out
quality estimate.

Both variants issue one request for each of the six target sections while
providing the other five passages as explicitly read-only context:

- `single-target-complete-text` returns exactly one complete corrected target;
- `single-target-bounded-patches` returns at most eight exact, unique,
  non-overlapping target-only old/new patches within fixed character budgets.

The first committed six-target pilot for each variant returned an isolated
Markdown `json` fence in all 12 responses. Screen revision 2 therefore accepts
bare JSON or exactly one such fence as a transport envelope. Text outside that
envelope and every semantic contract violation remain strict failures; this
does not relax patch or quality gates.

Each variant plans 60 target sections twice for 120 requests. Promotion to the
180-document screen requires at least 118 mechanically valid requests, no token
cap, byte-identical repeat pairs, no accepted edit above a 30% normalized word
edit rate, no locale-level macro-WER regression, no newly damaged correct
input, and no more regressed than improved section observations. A variant
stops early once its accepted count plus every missing request cannot reach the
minimum. Failure does not justify weakening a gate.

Run and summarize the complete-text variant:

```sh
node scripts/run-postprocessing-factorial-local-llm.mjs run \
  --screen benchmarks/postprocessing/local-llm-gemma-target-complete-screen.json \
  --results-subdir llm-gemma-target-complete-results \
  --candidate gemma-4-e2b-it-4bit-mlx
node scripts/run-postprocessing-factorial-local-llm.mjs summarize \
  --screen benchmarks/postprocessing/local-llm-gemma-target-complete-screen.json \
  --results-subdir llm-gemma-target-complete-results \
  --summary-output benchmarks/postprocessing/local-llm-gemma-target-complete-results.json
```

Run and summarize the bounded-patch variant:

```sh
node scripts/run-postprocessing-factorial-local-llm.mjs run \
  --screen benchmarks/postprocessing/local-llm-gemma-target-patches-screen.json \
  --results-subdir llm-gemma-target-patches-results \
  --candidate gemma-4-e2b-it-4bit-mlx
node scripts/run-postprocessing-factorial-local-llm.mjs summarize \
  --screen benchmarks/postprocessing/local-llm-gemma-target-patches-screen.json \
  --results-subdir llm-gemma-target-patches-results \
  --summary-output benchmarks/postprocessing/local-llm-gemma-target-patches-results.json
```

Create the combined, digest-pinned early-stop decision:

```sh
node scripts/run-postprocessing-factorial-local-llm.mjs summarize-ab
```

The comparison is complete by irreversible early rejection, although its two
variant reports intentionally remain partial:

| Variant | Captured | Strictly valid | Best possible final valid count | Repeat evidence | Observed strict-or-raw macro WER | Disposition |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Single-target complete text | 31/120 | 25/31 | 114/120 | 15/15 pairs byte-identical | 11.17% → 11.17% (+0.03%) | Reject |
| Single-target bounded patches | 6/120 | 1/6 | 115/120 | No complete pair before stop | 17.21% → 16.96% (-1.41%) | Reject |

The minimum is 118 valid requests, so neither missing tail can reverse the
decision. Complete text eliminated gross cross-section copying in the captured
slice and produced no edit above 30%, but six deterministic dialogue responses
were malformed or added a prohibited `position` field. It also produced two
improved and two regressed observations, with a small German aggregate
regression. Bounded patches failed five of its first six requests through
no-op patches, excessive patch counts, or otherwise nonconforming patch lists;
the one valid patch improved its target.

The machine-readable evidence is split into the
[complete-text report](../benchmarks/postprocessing/local-llm-gemma-target-complete-results.json),
[bounded-patch report](../benchmarks/postprocessing/local-llm-gemma-target-patches-results.json),
and [combined decision](../benchmarks/postprocessing/local-llm-gemma-target-ab-results.json).
Gemma 4 E2B is not promoted to another full screen. The frozen challenge slice
should next be used as a cheap preflight for a materially stronger local model
or the already pinned hosted ceilings; only a contract-and-quality survivor
should reach held-out professional audio.

## Hosted challenge preflight

The hosted preflight reuses the exact ten documents and 60 single-target
requests from the complete-text Gemma challenge. It does not reopen corpus,
TTS, STT, prompt, or target selection. The five candidates are GPT-5.6 Sol,
Gemini 3.6 Flash, GPT-5.6 Terra, Kimi K3, and Claude Sonnet 5. Every request
uses its manifest-pinned provider, disables fallback, requires supported
parameters, denies data collection, and requires ZDR. The consumed Qwen3.7 Max
non-ZDR exception is neither needed nor reused.

Execution is deliberately staged:

1. Run repeat one for all five candidates, up to 60 requests each.
2. Stop a candidate as soon as its acceptance minimum becomes unreachable or
   the first token cap, gross edit above 30%, or correct-input regression makes
   promotion impossible.
3. Apply the complete first-repeat gates, including per-locale macro WER and
   section improvement/regression balance.
4. Run repeat two only for first-repeat survivors.
5. Treat byte-identical hosted repeats as an observation, not a requirement;
   both repeats must still pass the contract and quality gates.

The conservative cost envelope counts every rendered Unicode code point as an
input token and assumes every response consumes all 2,048 configured completion
tokens. On the materialized slice it is `$17.49` for repeat one across all five
models and `$34.97` if every model survives into repeat two. The more realistic
pre-run estimate for repeat one is `$4.22`, including a 768-token reasoning
allowance for each low-reasoning route. Actual provider-reported request cost
remains authoritative. The runner refuses to start without an explicit
per-invocation USD budget and never retries a paid request automatically.

The original 768-token cap was retired after one `$0.008559` Gemini calibration
request spent 750 completion tokens and reached `finish_reason=length` after
only 39 content characters. That request is not candidate-quality evidence and
is excluded from the preflight; its redacted
[calibration record](../benchmarks/postprocessing/hosted-llm-target-complete-calibration.json)
preserves the cost, response identity, digests, and corrective decision.

Prepare and validate the run without a network request:

```sh
node scripts/run-postprocessing-factorial-hosted-llm.mjs estimate
node scripts/run-postprocessing-factorial-hosted-llm.mjs self-test
```

After committing the plan so evidence can name its exact source revision, run
one bounded stage and create the resumable partial decision:

```sh
node --env-file=.env.local \
  scripts/run-postprocessing-factorial-hosted-llm.mjs run \
  --repetition 1 \
  --candidate gemini-3.6-flash-openrouter-google-vertex-global \
  --budget-usd 1.68
node scripts/run-postprocessing-factorial-hosted-llm.mjs summarize
```

The machine-readable
[screen](../benchmarks/postprocessing/hosted-llm-target-complete-screen.json),
[staged plan](../benchmarks/postprocessing/hosted-llm-target-complete-plan.json),
and [cost estimate](../benchmarks/postprocessing/hosted-llm-target-complete-estimate.json)
freeze this boundary before the first paid request.

The staged preflight terminates with 479 quality requests. The 121 unissued
requests are intentional tails after Sol and Claude became ineligible; they are
not transport or contract failures. All 479 completed requests satisfy the
mechanical response contract.

| Candidate | Completed | Contract | Improved / regressed | Cost | Final disposition |
| --- | ---: | ---: | ---: | ---: | --- |
| GPT-5.6 Sol | 51/60 | 51/51 valid | 30 / 5 | `$0.866140` | Rejected after changing a correct English present-tense statement into past tense |
| Gemini 3.6 Flash | 120/120 | 120/120 valid | 79 / 2 | `$0.977504` | Promoted from the development preflight |
| GPT-5.6 Terra | 120/120 | 120/120 valid | 68 / 11 | `$1.018991` | Promoted from the development preflight |
| Kimi K3 | 120/120 | 120/120 valid | 65 / 6 | `$1.025975` | Promoted from the development preflight |
| Claude Sonnet 5 | 68/120 | 68/68 valid | 44 / 3 | `$0.817426` | Rejected after changing Portuguese `organização matemática` to `organização anatômica` in an otherwise exact target |

Gemini, Terra, and Kimi pass every precommitted gate in both repeats, improve
all five locale macro-WER values, and have no gross edit, token cap, or
correct-input regression. Their combined relative error reductions are:

| Candidate | DE | EN | ES | FR | PT | Byte-identical repeat pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemini 3.6 Flash | 41.7% | 13.5% | 21.9% | 39.2% | 43.7% | 30/60 |
| GPT-5.6 Terra | 35.3% | 12.0% | 16.5% | 29.5% | 24.8% | 24/60 |
| Kimi K3 | 25.6% | 16.4% | 16.4% | 17.5% | 25.9% | 30/60 |

The formal
[decision](../benchmarks/postprocessing/hosted-llm-target-complete-decision.json)
therefore retains all three as development survivors. This is not a product
selection.

Claude and Kimi exposed explicit upstream HTTP 429 responses. Plan revision 3
allows at most five server-directed deferrals per logical request only when the
429 arrives before any response id, content, usage, or charge. This is not an
automatic paid retry: successful, ambiguous, disconnected, timed-out, or
malformed requests are never replayed, and provider fallback remains disabled.
The final request records capture seven such unbilled Kimi deferrals. The 479
quality requests cost `$4.706035` in total, plus the separately excluded
`$0.008559` token-cap calibration.

### Semantic regression audit

WER alone does not distinguish a punctuation repair from a changed date or
technical term. A separate
[semantic review](../benchmarks/postprocessing/hosted-llm-target-complete-semantic-review.json)
therefore inspects all 27 numerically regressed observations across 20 unique
candidate/document/target cases. It remains post-hoc and does not rewrite the
precommitted decision.

The review changes the operational order, not the formal survivor set:

1. **Gemini 3.6 Flash** is the primary hosted quality ceiling because it has
   the best aggregate reduction and the narrowest regression surface. Its one
   repeated Spanish case still matters: it repairs a garbled discourse marker
   but silently changes the synthesized year 1981 to the more plausible 1980.
2. **Kimi K3** is the second ceiling. Several WER regressions are
   meaning-preserving, but one Spanish passage has unstable clause
   reconstruction and the same date-fidelity risk.
3. **GPT-5.6 Terra** remains a formal survivor but ranks third because it
   changes a German technical term, performs an unsupported English tense
   rewrite, and has the widest regression surface.

No candidate is product-selected. The next gate must use identical held-out
professional-audio ASR outputs and score dates, numbers, names, negation, and
technical terms separately from punctuation, casing, and aggregate WER.

This remains a development contract/quality screen. Release acceptance still
requires held-out human podcast or audiobook audio.

## Pragmatic current-model extension

The strict preflight above answered whether a candidate could pass a
zero-regression safety contract. It did not answer the product question that
motivated postprocessing: whether a model produces materially more useful
transcripts overall while the raw transcript remains available. The
[pragmatic extension plan](../benchmarks/postprocessing/hosted-llm-pragmatic-extension-plan.json)
therefore keeps the same frozen 60 targets and prompt but changes the gate:

- one correct-input regression is recorded for semantic review rather than
  stopping the run;
- a token-limit response, a gross edit above 30%, or an unreachable mechanical
  minimum remains a hard failure;
- a candidate needs at least 5% aggregate relative WER reduction and at least
  as many improved as regressed sections in each repeat;
- language aggregates remain separate and may support language-specific
  selection;
- every numeric WER regression still receives a semantic review before a model
  enters the product shortlist.

OpenRouter's Natural Languages task ranking was used only to discover
DeepSeek V4 Flash and MiniMax M3. The ranking is based on spend share, not a
controlled quality score. The captured endpoint catalog provided ZDR routes
with structured outputs: Parasail FP8 for DeepSeek and Together for MiniMax.
The extension also reran GPT-5.6 Sol and Claude Sonnet 5 from the beginning so
their results use the same pragmatic gate rather than merging truncated
strict-gate tails.

The runner completed 445 of the planned 480 requests. The 35 unissued requests
are Claude's intentional tail after its mechanical minimum became unreachable.
All other candidates completed both repeats:

| Candidate | Completed / accepted | Improved / regressed | Relative WER reduction | Recorded cost | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| GPT-5.6 Sol | 120 / 120 | 75 / 11 | 37.2% | `$2.047320` | Quality ceiling; semantic safeguards required |
| DeepSeek V4 Flash | 120 / 120 | 68 / 7 | 20.4% | `$0.038513` | Primary value candidate |
| MiniMax M3 | 120 / 120 | 46 / 3 | 10.0% | `$0.077541` | Passes gate; not product-shortlisted |
| Claude Sonnet 5 | 85 / 82 | 49 / 0 | 20.7% on captured requests | `$0.984290` known plus three unknown terminal responses | Reject pinned route |

The complete survivors differ substantially by language:

| Candidate | DE | EN | ES | FR | PT |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPT-5.6 Sol | 43.4% | 18.1% | 29.2% | 29.3% | 44.2% |
| DeepSeek V4 Flash | 21.3% | 7.9% | 24.5% | 16.2% | 25.5% |
| MiniMax M3 | 6.4% | 1.6% | 20.8% | 9.9% | 15.6% |

The [semantic review](../benchmarks/postprocessing/hosted-llm-pragmatic-extension-semantic-review.json)
audits all 21 regressed observations across 13 unique cases. Sol remains the
quality ceiling but repeatedly performs an unsupported English tense rewrite
and a plausible-but-unfaithful Spanish date reconstruction. DeepSeek has one
material dialogue-perspective rewrite, never changes a correct target into an
error, and is about 53 times cheaper than Sol on this run. MiniMax's three
unique regressions are all material and its aggregate gain is lower than
DeepSeek's, so it adds benchmark evidence but not another product option.

Claude's accepted outputs are unusually clean, but the pinned Azure route
returned HTTP 200 without usable text three times among the first 25
repeat-two logical requests. Those requests were not blindly retried because
they may have been charged. The route fails the product contract even though
the accepted-output quality signal remains promising.

The practical shortlist from this extension is therefore:

1. GPT-5.6 Sol as an opt-in hosted quality ceiling after protected fact-bearing
   spans are implemented.
2. DeepSeek V4 Flash as the primary hosted value candidate and next adapter
   target.

Enhancement remains optional, the raw transcript remains authoritative
fallback evidence, and neither candidate becomes an unconditional default from
this synthetic development slice.

### DeepSeek V4 Pro partial diagnostic

DeepSeek V4 Pro was added as a bounded challenger on the identical frozen
targets and prompt. The full precommitted run could not be completed on a
single acceptable route: CoreWeave FP8 stopped after 49 valid requests through
persistent explicit unbilled rate limits, Novita FP8 could not satisfy the
required strict JSON schema, and DeepInfra FP4 stopped accepting new requests
after 47 valid requests despite cooldown and request pacing. Provider outputs
were never combined into a nominal full run.

The resulting
[partial diagnostic](../benchmarks/postprocessing/hosted-llm-deepseek-v4-pro-partial-diagnostic.json)
uses the 41 repeat-one targets captured by both Pro providers and scores the
existing Flash and Sol outputs on exactly that intersection:

| Candidate | Raw → post word errors | Relative reduction | Improved / regressed |
| --- | ---: | ---: | ---: |
| DeepSeek V4 Pro, CoreWeave FP8 | 412 → 317 | 23.1% | 21 / 3 |
| DeepSeek V4 Pro, DeepInfra FP4 | 412 → 321 | 22.1% | 22 / 2 |
| DeepSeek V4 Flash, Parasail FP8 | 412 → 326 | 20.9% | 24 / 3 |
| GPT-5.6 Sol, Azure EU | 412 → 269 | 34.7% | 27 / 4 |

V4 Pro is therefore a modest quality improvement over Flash on this paired
slice, not a new quality tier. The two Pro providers produced different text
on 16 of the 41 common targets, which keeps provider and quantization identity
material. DeepInfra's three numeric regressions include one material French
hallucination and two minor Spanish/Portuguese changes.

The product shortlist does not change: Flash remains the primary value
candidate and Sol the quality ceiling. Pro should be rerun only when one pinned
structured-output ZDR route can finish both repeats reliably.

## Larger local-model follow-up

The completed local work rejects the tested 4-bit Qwen 3.5 0.8B, SmolLM3 3B,
and Gemma 4 E2B configurations; it does not exhaust local MLX quality. The
[upscale challenger plan](../benchmarks/postprocessing/local-llm-upscale-challenger-plan.json)
therefore freezes three materially stronger candidates that fit individually
on the 64 GiB Apple Silicon host:

| Candidate | 4-bit snapshot | Model class |
| --- | ---: | --- |
| Gemma 4 26B A4B | 15.4 GB | sparse, 4B active |
| Qwen 3.5 35B A3B | 20.4 GB | sparse, 3B active |
| Qwen 3.5 27B | 16.1 GB | dense |

They first receive one technical load and contract probe, then one frozen
60-target repeat. Only quality survivors receive repeat two; only the best
two-repeat survivor may receive a 4-bit versus 8-bit comparison. This tests the
open model-capacity and quantization questions without reopening the rejected
small-model prompt matrix.
