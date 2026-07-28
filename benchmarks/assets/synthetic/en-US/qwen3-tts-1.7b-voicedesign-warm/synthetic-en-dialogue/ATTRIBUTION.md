# Attribution and provenance

## Source text

- Work: “A quiet recording”, Cuttledoc benchmark dialogue
- Exact source digest:
  `15d65971c36965761b02557d172a849c683d4541e16c84fef5965583ee988939`
- Source history: [repository history](https://github.com/sebastian-software/cuttledoc/commits/main/benchmarks/fixtures/text/synthetic-en-dialogue.txt)
- Source license: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Passage selector and digest: `synthetic-en-dialogue` in
  `benchmarks/fixtures/synthetic-roundtrip-selection.json`

The repository-authored passage is materialized without an additional
spoken-text transform. One generated voice reads the exchange, so this is a
dialogue-text and punctuation control rather than a two-speaker or
diarization fixture.

## Generated recording

- Generator: `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16`
- Model revision: `7d3824abff87e49756bb0f83fb5411de75d160c4`
- Model license: Apache-2.0
- Runtime: `Blaizzy/mlx-audio` 0.4.5
- Runtime revision: `64e8416c303fb3b3463dab8eb4ebd78c55a87c1a`
- Runtime license: MIT
- Official compute runtime: Apple MLX 0.32.0
- Voice profile: `qwen-en-warm-dialogue`, Seed 0
- Voice instruction: “A warm, conversational American English voice with
  natural pacing, gentle energy, and polished podcast delivery.”
- Generation record:
  `benchmarks/raw/phase5.qwen3-tts-1.7b-voicedesign.qwen-en-warm-dialogue.1/result.json`

The lossless generated source is mono 24 kHz float PCM with SHA-256
`16861551367714425a050ccef68328e040104196f1935248429823bc2d1cec8a`.
It was quantized to the PCM16 WAV with SHA-256
`dd1ab38c86dc4fece4830d0196f24f1dd3378b6f038f81dd5816f93570634e58`
before the checked-in Ogg Opus encode.

Qwen reads the reference correctly through “avoid chasing every sentence”,
then repeatedly synthesizes “What happens if someone turns away while
speaking?” until the fixed 1,200-token limit. The last 32 of 134 reference
words are absent. Four receivers therefore report roughly 24–25% WER;
Whisper transcribes the audible repeated phrase and exceeds 200% WER. This is
a reproducible failed generation control, not a quality exemplar or a passed
dialogue cell.

The generated recording and its source passage are redistributed under CC
BY-SA 4.0. Preserve this attribution, the license link, and the indication of
changes when redistributing either file.
