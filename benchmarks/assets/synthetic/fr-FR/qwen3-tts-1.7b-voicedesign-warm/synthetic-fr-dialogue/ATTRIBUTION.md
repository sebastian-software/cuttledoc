# Attribution and provenance

## Source text

- Work: “Un enregistrement calme”
- Exact source digest: `03703f7c33e12ea120df1844383194f8231593e35212b4306e947f76a370c70b`
- Revision: [permanent link](https://github.com/sebastian-software/cuttledoc/blob/main/benchmarks/fixtures/text/synthetic-fr-dialogue.txt)
- Source history: [history](https://github.com/sebastian-software/cuttledoc/commits/main/benchmarks/fixtures/text/synthetic-fr-dialogue.txt)
- Source license: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Passage selector and digest: `synthetic-fr-dialogue` in
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
- Voice profile: `qwen-fr-warm-dialogue`, Seed 0
- Voice instruction: “A warm, conversational French-speaking voice with natural pacing, gentle energy, and polished podcast delivery.”
- Generation record:
  `benchmarks/raw/phase5.qwen3-tts-1.7b-voicedesign.qwen-fr-warm-dialogue.1/result.json`

The lossless generated source is mono 24 kHz float PCM with SHA-256
`d41af4cabc9a13091a2c0e04cf08d502042c667d035feb089f4c3cfec93f953b`. It was quantized to the PCM16 WAV with SHA-256
`9eec7dfda0f554606c44a66dcf22e0d01f6a75e287f037d532995d389ae067f1` before the checked-in Ogg Opus encode.

All five receivers agree that the dialogue stops after “Jonas sourit”. Qwen then repeats unintelligible material until the fixed token limit and omits the remaining dialogue. Listening review remains required before treating this recording as
a voice-quality exemplar.

The generated recording and its source passage are redistributed under CC
BY-SA 4.0. Preserve this attribution, the license link, and the indication of
changes when redistributing either file.
