# Attribution and provenance

## Source text

- Work: “Una grabación tranquila”
- Exact source digest: `1a1f35ebd4ecedb1e0123402f88ff310006f831f916c03676e37708a783d435e`
- Revision: [permanent link](https://github.com/sebastian-software/cuttledoc/blob/main/benchmarks/fixtures/text/synthetic-es-dialogue.txt)
- Source history: [history](https://github.com/sebastian-software/cuttledoc/commits/main/benchmarks/fixtures/text/synthetic-es-dialogue.txt)
- Source license: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Passage selector and digest: `synthetic-es-dialogue` in
  `benchmarks/fixtures/synthetic-roundtrip-selection.json`

The passage is materialized without an additional spoken-text transform.

## Generated recording

- Generator: `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16`
- Model revision: `7d3824abff87e49756bb0f83fb5411de75d160c4`
- Model license: Apache-2.0
- Runtime: `Blaizzy/mlx-audio` 0.4.5
- Runtime revision: `64e8416c303fb3b3463dab8eb4ebd78c55a87c1a`
- Runtime license: MIT
- Official compute runtime: Apple MLX 0.32.0
- Voice profile: `qwen-es-warm-dialogue`, Seed 0
- Voice instruction: “A warm, conversational Latin American Spanish voice with natural pacing, gentle energy, and polished podcast delivery.”
- Generation record:
  `benchmarks/raw/phase5.qwen3-tts-1.7b-voicedesign.qwen-es-warm-dialogue.1/result.json`

The lossless generated source is mono 24 kHz float PCM with SHA-256
`8fd1f148610d7cebb7aece31f71ae866d93445b0d1d0b63c62dd14f5afac4995`. It was quantized to the PCM16 WAV with SHA-256
`c0c87d6e2d4db3005687a0197d780a0d8503e2156279c2c59eb271cff0a9f88d` before the checked-in Ogg Opus encode.

Whisper, Qwen-ASR, Voxtral, and Apple each make one word edit and recover the complete dialogue. Parakeet alone makes fifteen edits with cross-language substitutions. Listening review remains required before treating this recording as
a voice-quality exemplar.

The generated recording and its source passage are redistributed under CC
BY-SA 4.0. Preserve this attribution, the license link, and the indication of
changes when redistributing either file.
