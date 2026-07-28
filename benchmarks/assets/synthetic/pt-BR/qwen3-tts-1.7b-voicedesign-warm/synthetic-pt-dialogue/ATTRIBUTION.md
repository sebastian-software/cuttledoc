# Attribution and provenance

## Source text

- Work: “Uma gravação tranquila”
- Exact source digest: `876ebf34ab63a75fc39364195fd7ffa751e077cb37eab23b6605a307ef54b1e2`
- Revision: [permanent link](https://github.com/sebastian-software/cuttledoc/blob/main/benchmarks/fixtures/text/synthetic-pt-dialogue.txt)
- Source history: [history](https://github.com/sebastian-software/cuttledoc/commits/main/benchmarks/fixtures/text/synthetic-pt-dialogue.txt)
- Source license: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Passage selector and digest: `synthetic-pt-dialogue` in
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
- Voice profile: `qwen-pt-warm-dialogue`, Seed 0
- Voice instruction: “A warm, conversational Brazilian Portuguese voice with natural pacing, gentle energy, and polished podcast delivery.”
- Generation record:
  `benchmarks/raw/phase5.qwen3-tts-1.7b-voicedesign.qwen-pt-warm-dialogue.1/result.json`

The lossless generated source is mono 24 kHz float PCM with SHA-256
`8c677612f57b5b242f837d111ebc9e71818b5003db5210c81f51e79153f5dafd`. It was quantized to the PCM16 WAV with SHA-256
`f4e7463ff20967636374b74a556a4e778e397bff598b42881b1e3cedaf3f5725` before the checked-in Ogg Opus encode.

All five receivers recover the complete dialogue with one to four word edits. No receiver shows a shared omission, insertion loop, or critical-name failure. Listening review remains required before treating this recording as
a voice-quality exemplar.

The generated recording and its source passage are redistributed under CC
BY-SA 4.0. Preserve this attribution, the license link, and the indication of
changes when redistributing either file.
