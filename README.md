<p align="center">
  <img src="packages/docs/app/assets/logo.svg" width="150" height="150" alt="cuttledoc logo">
</p>

<h1 align="center">cuttledoc</h1>

<p align="center">
  <strong>Fast speech-to-text transcription for Node.js with multiple backend support (local + cloud).</strong>
</p>

[![CI](https://github.com/sebastian-software/cuttledoc/actions/workflows/ci.yml/badge.svg)](https://github.com/sebastian-software/cuttledoc/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/sebastian-software/cuttledoc/branch/main/graph/badge.svg)](https://codecov.io/gh/sebastian-software/cuttledoc)
[![npm version](https://badge.fury.io/js/cuttledoc.svg)](https://www.npmjs.com/package/cuttledoc)
[![npm downloads](https://img.shields.io/npm/dm/cuttledoc.svg)](https://www.npmjs.com/package/cuttledoc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10%2B-orange.svg)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Platform](<https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-lightgrey.svg>)](https://github.com/sebastian-software/cuttledoc)

## Features

- 🎤 **Multiple Backends**: Local (Whisper, Parakeet) and Cloud (OpenAI gpt-4o-transcribe)
- 🚀 **Native Performance**: Pure Node.js, no Python required
- 📱 **Offline & Online**: Choose between local processing or cloud API
- 🎬 **Video Support**: Extract audio from MP4, WebM, MKV
- 🤖 **LLM Correction**: Auto-correct transcripts with gemma3n:e4b by default (+41% WER improvement)
- 📊 **Detailed Stats**: Processing time, word count, confidence scores

## Installation

```bash
npm add cuttledoc
# or
pnpm add cuttledoc
```

### Requirements

- macOS with Apple Silicon (M1/M2/M3/M4)
- Node.js 22+
- ~2GB disk space for models

## Quick Start

### CLI

```bash
# Basic transcription with LLM correction (default)
npx cuttledoc video.mp4

# Raw STT output without LLM correction
npx cuttledoc video.mp4 --no-correct

# With formatting (paragraphs, headings, markdown)
npx cuttledoc podcast.mp3 -f -o transcript.md

# Use specific backend and language
npx cuttledoc meeting.m4a -b parakeet -l de

# Use OpenAI cloud API (best quality)
export OPENAI_API_KEY=sk-...
npx cuttledoc meeting.m4a -b openai

# Show processing statistics
npx cuttledoc audio.wav --stats
```

### API

```typescript
import { transcribe } from "cuttledoc"

// Local transcription (offline)
const result = await transcribe("audio.mp3", {
  language: "en",
  backend: "auto" // auto, whisper, parakeet, openai
})

console.log(result.text)
console.log(`Duration: ${result.durationSeconds}s`)

// Cloud transcription (OpenAI)
const cloudResult = await transcribe("audio.mp3", {
  backend: "openai",
  apiKey: process.env.OPENAI_API_KEY, // or pass directly
  model: "gpt-4o-transcribe" // or "gpt-4o-mini-transcribe"
})
```

### With LLM Enhancement

```typescript
import { transcribe } from "cuttledoc"
import { enhanceTranscript } from "@cuttledoc/llm"

const result = await transcribe("podcast.mp3")

// Correction is enabled by default, but you can customize:
const enhanced = await enhanceTranscript(result.text, {
  provider: "ollama",
  model: "phi4:14b", // best benchmarked quality with Ollama
  mode: "correct" // or "format" for full Markdown formatting
})

console.log(enhanced.plainText) // Corrected text
console.log(enhanced.markdown) // With formatting (if mode="format")
```

## CLI Reference

```
cuttledoc <audio-file> [options]
cuttledoc models [list|download <model>]

Options:
  -b, --backend <name>    Backend: auto, whisper, parakeet, openai (default: auto)
  -m, --model <name>      OpenAI speech model (requires -b openai)
  --api-key <key>         OpenAI API key (or set OPENAI_API_KEY env var)
  -l, --language <code>   Language code: en, de, fr, es, etc.
  -o, --output <file>     Write output to file
  -f, --format            Add formatting (paragraphs, headings, markdown)
  --no-correct            Disable LLM correction (raw STT output)
  --llm-model <name>      LLM model (default: gemma3n:e4b)
  -s, --stats             Show processing statistics
  -q, --quiet             Minimal output
  -h, --help              Show help
  -v, --version           Show version
```

> **Note:** LLM correction is enabled by default. Use `--no-correct` for raw STT output.

### Model Management

```bash
# List available models
cuttledoc models list

# Download speech models
cuttledoc models download parakeet    # 160 MB, 25 languages
cuttledoc models download whisper     # ~2.9 GB, 99 languages

# Download LLM model (for correction/formatting)
# For Ollama (recommended): ollama pull phi4:14b
# For GGUF: cuttledoc models download gemma3n:e4b
```

## Backends

### Local Backends (Offline, No API Key)

| Backend                    | RTF  | Avg WER | Languages | Size    |
| -------------------------- | ---- | ------- | --------- | ------- |
| **Parakeet v3** (default)  | 0.03 | 6.4%    | 25        | 160 MB  |
| **Whisper large-v3-turbo** | 0.07 | 5.1%    | 99        | ~2.9 GB |

### Cloud Backends (Requires API Key)

| Backend                    | RTF  | Avg WER | Languages | Cost        |
| -------------------------- | ---- | ------- | --------- | ----------- |
| **gpt-4o-mini-transcribe** | 0.10 | 4.8%    | 50+       | ~$0.003/min |
| **gpt-4o-transcribe**      | 0.16 | 5.1%    | 50+       | ~$0.006/min |

OpenAI's next-generation audio models offer improved WER (Word Error Rate) over local Whisper:

- Better language recognition and accuracy
- Handles accents and challenging audio better
- See: [Introducing next-generation audio models](https://openai.com/index/introducing-our-next-generation-audio-models/)

### Backend Selection

- **`auto`** (default): On macOS, Parakeet for supported languages and Whisper for others. On Linux/Windows,
  OpenAI is selected when an API key is configured; otherwise the CLI explains how to enable it.
- **`parakeet`**: NVIDIA Parakeet TDT v3 – fastest, 25 languages including major European
- **`whisper`**: OpenAI Whisper large-v3-turbo – best coverage, 99 languages including Asian/Arabic
- **`openai`**: OpenAI cloud API – best accuracy, requires `OPENAI_API_KEY`

### Why These Models?

We chose these three backends for simplicity and reliability:

**Local (Offline):**

1. **Parakeet v3** – Best speed-to-quality ratio, 25 languages (160 MB, 4x realtime)
2. **Whisper large-v3-turbo** – Full multilingual model, 99 languages (~2.9 GB, ~1x realtime)

**Cloud (Requires API Key):**

3. **gpt-4o-mini-transcribe** – Best accuracy (4.8% WER), fastest, and cheapest cloud option
4. **gpt-4o-transcribe** – Premium option, slightly better for German

> **Note on Whisper turbo**: We use `large-v3-turbo` which offers the best speed-to-quality ratio
> with full multilingual support (99 languages). It's ~4x faster than `large-v3` with similar accuracy.

> **Note on Python backends**: We previously supported Phi-4-multimodal and Canary-1B-v2 via Python,
> but removed them to simplify architecture. See [ADR-001](docs/decisions/001-remove-python-asr-backends.md)
> for the full analysis. The code is preserved in branch `archive/python-asr-backends-2025-01`.

### Long Audio Support

Both backends use CoreML and process audio without length limits:

- **Parakeet**: Streaming transducer, handles any audio length
- **Whisper**: Based on whisper.cpp with chunked processing

Just pass your audio file and get the complete transcript.

## Supported Formats

**Audio**: WAV, MP3, M4A, AAC, FLAC, OGG, OPUS
**Video**: MP4, WebM, MKV, MOV, AVI

Audio is automatically extracted and resampled to 16kHz mono.

## LLM Enhancement

LLM-based post-processing is enabled by default to improve transcription quality.

**Correction Mode** (default):

- Fix punctuation and capitalization
- Correct word boundaries and contractions
- Remove filler words and repetitions
- Fix obvious STT errors

**Format Mode** (`--format` / `mode: "format"`):

- Everything from correction mode, plus:
- Structure into logical paragraphs
- Add Markdown headings and emphasis
- Bullet lists where appropriate

All processing happens locally using [Ollama](https://ollama.com) or [node-llama-cpp](https://github.com/withcatai/node-llama-cpp).

See [packages/llm/README.md](packages/llm/README.md) for detailed documentation.

### LLM Correction Benchmark

We tested LLM correction on TTS-generated audio (5-7 min per language, 2 speakers each):

| Model                         | Avg WER Before | Avg WER After | Improvement | Speed  |
| ----------------------------- | -------------- | ------------- | ----------- | ------ |
| **phi4:14b** (best quality)   | 5.6%           | **2.8%**      | **+52.0%**  | 36 t/s |
| **mistral-nemo**              | 5.6%           | 3.2%          | +42.7%      | 60 t/s |
| **gemma3n:e4b** (CLI default) | 5.6%           | 3.3%          | +41.2%      | 35 t/s |
| gemma3n:e2b                   | 5.6%           | 3.6%          | +36.9%      | 44 t/s |

**Key findings:**

- **phi4:14b** offers the best accuracy with Ollama (+52%), especially for German/Spanish
- **mistral-nemo** offers best speed (60 t/s) with good accuracy (+43%)
- **gemma3n:e4b** is the CLI default and most reliable, with no negative outliers across all languages
- **Recommendation:** Keep the CLI default for reliability, or explicitly select phi4:14b with Ollama for best quality

## Quality Benchmark

Word Error Rate (WER) on [FLEURS](https://huggingface.co/datasets/google/fleurs) native speaker recordings (lower is better):

| Backend                    | 🇬🇧 EN | 🇪🇸 ES | 🇩🇪 DE | 🇫🇷 FR | 🇧🇷 PT | Avg WER | RTF  |
| -------------------------- | ----- | ----- | ----- | ----- | ----- | ------- | ---- |
| **gpt-4o-mini-transcribe** | 5.7%  | 1.3%  | 3.4%  | 7.3%  | 6.0%  | 4.8%    | 0.10 |
| **gpt-4o-transcribe**      | 9.9%  | 2.1%  | 2.8%  | 6.3%  | 4.6%  | 5.1%    | 0.16 |
| **Whisper large-v3-turbo** | 4.9%  | 2.1%  | 2.8%  | 10.6% | 5.2%  | 5.1%    | 0.07 |
| **Parakeet v3**            | 4.6%  | 3.6%  | 4.5%  | 10.1% | 9.0%  | 6.4%    | 0.03 |

_RTF = Real-Time Factor (lower = faster). All values measured on Apple M1 Pro._

### 🏆 Ranking by Accuracy

| Rank | Backend                    | Avg WER | Best for                           |
| ---- | -------------------------- | ------- | ---------------------------------- |
| 🥇   | **gpt-4o-mini-transcribe** | 4.8%    | Cloud, best overall + cheapest     |
| 🥈   | **gpt-4o-transcribe**      | 5.1%    | Cloud, best for DE                 |
| 🥈   | **Whisper large-v3-turbo** | 5.1%    | Offline, broadest language support |
| 4    | **Parakeet v3**            | 6.4%    | Fast + accurate, 25 languages      |

### ⚡ Ranking by Speed

| Rank | Backend                    | RTF  | Best for                |
| ---- | -------------------------- | ---- | ----------------------- |
| 🥇   | **Parakeet v3**            | 0.03 | Fastest, 25 languages   |
| 🥈   | **Whisper large-v3-turbo** | 0.07 | Fast, 99 languages      |
| 🥉   | **gpt-4o-mini-transcribe** | 0.10 | Cloud, no local compute |
| 4    | **gpt-4o-transcribe**      | 0.16 | Cloud, premium quality  |

_RTF = Real-Time Factor. 0.10 means 10s audio transcribed in 1.0s._

Benchmark methodology:

- WER measured on **raw STT output** (before LLM enhancement)
- Dataset: [FLEURS](https://huggingface.co/datasets/google/fleurs) – native speaker recordings (10 samples × 5 languages)
- Hardware: Apple M1 Pro with CoreML (Neural Engine + GPU)
- OpenAI: gpt-4o-transcribe via API

## Performance

Typical processing speed on Apple Silicon (M1+):

| Input        | Backend        | Transcription | LLM | Total |
| ------------ | -------------- | ------------- | --- | ----- |
| 10 min audio | Parakeet       | ~18 sec       | -   | ~18s  |
| 10 min audio | Whisper        | ~42 sec       | -   | ~42s  |
| 10 min audio | Parakeet + LLM | ~18 sec       | 20s | ~40s  |

Note: Both local backends use CoreML for hardware acceleration (Neural Engine + GPU). First invocation has ~5-15s model loading overhead.

## Documentation

For detailed API reference, see the [documentation](https://sebastian-software.github.io/cuttledoc/).

## Development

This is a pnpm monorepo with the following packages:

```
cuttledoc/
├── packages/
│   ├── cuttledoc/     # Core transcription library + CLI
│   ├── llm/           # LLM transcript enhancement (@cuttledoc/llm)
│   ├── ffmpeg/        # FFmpeg audio processing (@cuttledoc/ffmpeg)
│   └── docs/          # Documentation site
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### Setup

```bash
# Clone
git clone https://github.com/sebastian-software/cuttledoc
cd cuttledoc

# Install (uses pnpm)
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start docs dev server
pnpm docs:dev
```

### Package Scripts

```bash
# Build specific package
pnpm --filter cuttledoc build
pnpm --filter @cuttledoc/cli build
pnpm --filter @cuttledoc/docs build

# Run tests in specific package
pnpm --filter cuttledoc test

# Lint
pnpm lint
```

## License

MIT © [Sebastian Software GmbH](https://sebastian-software.de)

## Acknowledgments

- [parakeet-coreml](https://github.com/sebastian-software/parakeet-node) - NVIDIA Parakeet TDT for CoreML
- [whisper-coreml](https://github.com/sebastian-software/whisper-node) - OpenAI Whisper for CoreML
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - High-performance Whisper inference
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) - LLM inference
- [Ollama](https://ollama.com) - Local LLM server
- [OpenAI GPT-4o Transcribe](https://openai.com/index/introducing-our-next-generation-audio-models/) - Next-gen cloud ASR
- [Microsoft Phi-4](https://huggingface.co/microsoft/phi-4) - Best LLM for transcript correction
- [Google Gemma](https://ai.google.dev/gemma) - Reliable open-weight LLM
