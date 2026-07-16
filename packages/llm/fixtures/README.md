# LLM benchmark fixtures

These fixtures power the TTS-based transcript-correction benchmark. Each
reference text is rendered with multiple speakers, transcribed by cuttledoc,
and corrected by local Ollama models. The benchmark compares both the raw and
corrected transcripts with the reference text using word error rate (WER).

## Layout

- `texts/<language>-sample.txt` contains the reference transcripts.
- `audio/<language>-sample - <speaker>.<ext>` contains the matching TTS audio.
- Generated STT caches, comparisons, and summaries are written to
  `packages/llm/results/` and are not source fixtures.

The committed audio was generated from the reference texts with multilingual
TTS voices. Regenerate it only when a reference text changes, keeping at least
two speakers per language so results are not tied to one voice.

## Run the benchmark

Install [Ollama](https://ollama.com) and start it with the desktop app or
`ollama serve`. In another terminal, pull the current comparison set:

```bash
ollama pull phi4:14b
ollama pull mistral-nemo
ollama pull gemma3n:e4b
ollama pull gemma3n:e2b
```

From the repository root, run:

```bash
pnpm --filter @cuttledoc/llm benchmark:tts
```

The benchmark uses Parakeet for most fixture languages and Whisper for French,
then evaluates correction quality and processing speed for every configured
model. Current published results and model recommendations live in the
[benchmark documentation](../../docs/content/docs/benchmarks.mdx); do not infer
recommendations from a single local run.
