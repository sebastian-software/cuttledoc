# Attribution and provenance

## Source text

- Work: “A quiet recording”, Cuttledoc benchmark dialogue
- Exact source digest:
  `51bb13dc91460c0d653d792042f8aa5b5b148fc9894e43a6c6d0e6cf23088203`
- Source history: [repository history](https://github.com/sebastian-software/cuttledoc/commits/main/benchmarks/fixtures/text/synthetic-de-dialogue.txt)
- Source license: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Passage selector and digest: `synthetic-de-dialogue` in
  `benchmarks/fixtures/synthetic-roundtrip-selection.json`

The repository-authored passage is materialized without an additional
spoken-text transform. One generated voice reads the full exchange, so this is
a dialogue-text and punctuation control rather than a two-speaker or
diarization fixture.

## Generated recording

- Generator: `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16`
- Model revision: `7d3824abff87e49756bb0f83fb5411de75d160c4`
- Model license: Apache-2.0
- Runtime: `Blaizzy/mlx-audio` 0.4.5
- Runtime revision: `64e8416c303fb3b3463dab8eb4ebd78c55a87c1a`
- Runtime license: MIT
- Official compute runtime: Apple MLX 0.32.0
- Voice profile: `qwen-de-warm-dialogue`, Seed 0
- Voice instruction: “A warm, conversational German-speaking voice with
  natural pacing, gentle energy, and polished podcast delivery.”
- Generation record:
  `benchmarks/raw/phase5.qwen3-tts-1.7b-voicedesign.qwen-de-warm-dialogue.1/result.json`

The lossless generated source is mono 24 kHz float PCM with SHA-256
`6519ca5543caf434b48e90970eed0c3e97aa32a14efae76c069b124a3bf5608e`.
It was quantized to the PCM16 WAV with SHA-256
`b88cbfc3869538d36fdae62b4e507d0aa1365f60459658490cf4a1ad348946b1`
before the checked-in Ogg Opus encode. The codec conversion is a format and
compression change; it does not intentionally alter the spoken content.

Whisper, direct Qwen3-ASR, and Apple each make one word edit; direct Voxtral
makes two. Parakeet makes seven receiver-specific edits, including “Bagmara”,
“Nine”, and an omitted speaker attribution. The other four receivers recover
those locations, so the shared evidence does not indicate a Qwen content
omission. This recording passes the dialogue lexical gate; listening review is
still required before treating it as a quality exemplar.

The generated recording and its source passage are redistributed under CC
BY-SA 4.0. Preserve this attribution, the license link, and the indication of
changes when redistributing either file.
