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
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/sebastian-software/cuttledoc)

## Features

- 🎤 **Multiple Backends**: Local (Whisper, Parakeet) and Cloud (OpenAI gpt-4o-transcribe)
- 🚀 **Native Performance**: Pure Node.js, no Python required
- 📱 **Offline & Online**: Choose between local processing or cloud API
- 🎬 **Video Support**: Extract audio from MP4, WebM, MKV
- 🤖 **LLM Enhancement**: Auto-correct and format transcripts (using Gemma 3n)
- 📊 **Detailed Stats**: Processing time, word count, confidence scores

## Installation

```bash
npm add cuttledoc
# or
pnpm add cuttledoc
```

### Requirements

- Node.js 24+
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
import { enhanceTranscript } from "cuttledoc/llm"

const result = await transcribe("podcast.mp3")

const enhanced = await enhanceTranscript(result.text, {
  model: "gemma3n:e4b",
  mode: "enhance" // or "correct" for minimal changes
})

console.log(enhanced.markdown)
```

## CLI Reference

```
cuttledoc <audio-file> [options]
cuttledoc models [list|download <model>]

Options:
  -b, --backend <name>    Backend: auto, whisper, parakeet, openai (default: auto)
  -m, --model <name>      Model: gpt-4o-transcribe, gpt-4o-mini-transcribe, etc.
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
cuttledoc models download parakeet-tdt-0.6b-v3   # 160 MB, 25 languages
cuttledoc models download whisper-large-v3       # 1.6 GB, 99 languages

# Download LLM model (for --enhance)
cuttledoc models download gemma3n:e4b
```

## Backends

### Local Backends (Offline, No API Key)

| Backend                   | RTF  | Avg WER | Languages | Size   |
| ------------------------- | ---- | ------- | --------- | ------ |
| **Parakeet v3** (default) | 0.24 | 6.4%    | 25        | 160 MB |
| **Whisper large-v3**      | 2.2  | 5.1%    | 99        | 1.6 GB |

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

- **`auto`** (default): Parakeet for 25 supported languages, Whisper for all others
- **`parakeet`**: NVIDIA Parakeet TDT v3 – fastest, excellent for English/German/European languages
- **`whisper`**: OpenAI Whisper large-v3 – best quality, 99 languages including Asian/Arabic
- **`openai`**: OpenAI cloud API – best accuracy, requires `OPENAI_API_KEY`

### Why These Models?

We chose these three backends for simplicity and reliability:

**Local (Offline):**

1. **Parakeet v3** – Best speed-to-quality ratio for European languages (160 MB, 4x realtime)
2. **Whisper large-v3** – Full multilingual model, 99 languages (1.6 GB, 0.45x realtime)

**Cloud (Requires API Key):**

3. **gpt-4o-mini-transcribe** – Best accuracy (4.8% WER), fastest, and cheapest cloud option
4. **gpt-4o-transcribe** – Premium option, slightly better for German

> **Note on Distil-Whisper**: The distilled Whisper models (`distil-large-v3`, `distil-large-v3.5`)
> are [English-only](https://huggingface.co/distil-whisper) and ignore the language parameter.
> We use the full `whisper-large-v3` for true multilingual support.

> **Note on Python backends**: We previously supported Phi-4-multimodal and Canary-1B-v2 via Python,
> but removed them to simplify architecture. See [ADR-001](docs/decisions/001-remove-python-asr-backends.md)
> for the full analysis. The code is preserved in branch `archive/python-asr-backends-2025-01`.

### Long Audio Support

Whisper has a 30-second context window limit. For longer audio:

- **Parakeet**: No limit, processes entire audio at once
- **Whisper**: Uses Silero VAD (Voice Activity Detection) to automatically split audio at natural pauses

This happens transparently - just pass your audio file and get the complete transcript.

## Supported Formats

**Audio**: WAV, MP3, M4A, AAC, FLAC, OGG, OPUS
**Video**: MP4, WebM, MKV, MOV, AVI

Audio is automatically extracted and resampled to 16kHz mono.

## LLM Enhancement

The optional LLM post-processing uses Gemma 3n to:

1. Generate a **TLDR summary** (2-3 sentences)
2. Structure text into **logical paragraphs**
3. Add **Markdown formatting**:
   - **Bold** for key terms
   - _Italic_ for emphasis
   - `##` Headings for topic changes
   - Bullet lists where appropriate
4. Fix obvious **transcription errors**

All processing happens locally using [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) or via Ollama.

### LLM Correction Benchmark

We tested LLM correction on TTS-generated audio (5-7 min per language, 2 speakers each):

| Model                  | Avg WER Before | Avg WER After | Improvement | Speed  |
| ---------------------- | -------------- | ------------- | ----------- | ------ |
| **phi4:14b** (default) | 5.6%           | **2.8%**      | **+52.0%**  | 36 t/s |
| **mistral-nemo**       | 5.6%           | 3.2%          | +42.7%      | 60 t/s |
| gemma3n:e4b            | 5.6%           | 3.3%          | +41.2%      | 35 t/s |
| gemma3n:e2b            | 5.6%           | 3.6%          | +36.9%      | 44 t/s |

**Key findings:**

- **phi4:14b** is the new default - best accuracy (+52%), especially for German/Spanish
- **mistral-nemo** offers best speed (60 t/s) with good accuracy (+43%)
- **gemma3n:e4b** is most reliable, no negative outliers across all languages
- **Recommendation:** Use default phi4:14b, or mistral-nemo for speed-critical use

## Quality Benchmark

Word Error Rate (WER) on [FLEURS](https://huggingface.co/datasets/google/fleurs) native speaker recordings (lower is better):

| Backend                    | 🇬🇧 EN | 🇪🇸 ES | 🇩🇪 DE | 🇫🇷 FR | 🇧🇷 PT | Avg WER | RTF  |
| -------------------------- | ----- | ----- | ----- | ----- | ----- | ------- | ---- |
| **gpt-4o-mini-transcribe** | 5.7%  | 1.3%  | 3.4%  | 7.3%  | 6.0%  | 4.8%    | 0.10 |
| **gpt-4o-transcribe**      | 9.9%  | 2.1%  | 2.8%  | 6.3%  | 4.6%  | 5.1%    | 0.16 |
| **Whisper large-v3**       | 4.9%  | 2.1%  | 2.8%  | 10.6% | 5.2%  | 5.1%    | 2.2  |
| **Parakeet v3**            | 4.6%  | 3.6%  | 4.5%  | 10.1% | 9.0%  | 6.4%    | 0.24 |

_RTF = Real-Time Factor (lower = faster). All values measured on Apple M1 Pro._

### 🏆 Ranking by Accuracy

| Rank | Backend                    | Avg WER | Best for                           |
| ---- | -------------------------- | ------- | ---------------------------------- |
| 🥇   | **gpt-4o-mini-transcribe** | 4.8%    | Cloud, best overall + cheapest     |
| 🥈   | **gpt-4o-transcribe**      | 5.1%    | Cloud, best for DE                 |
| 🥈   | **Whisper large-v3**       | 5.1%    | Offline, broadest language support |
| 4    | **Parakeet v3**            | 6.4%    | Fast + accurate, 25 European langs |

### ⚡ Ranking by Speed

| Rank | Backend                    | RTF  | Best for                    |
| ---- | -------------------------- | ---- | --------------------------- |
| 🥇   | **gpt-4o-mini-transcribe** | 0.10 | Cloud, fastest + cheapest   |
| 🥈   | **gpt-4o-transcribe**      | 0.16 | Cloud, premium quality      |
| 🥉   | **Parakeet v3**            | 0.24 | Real-time, batch processing |
| 4    | **Whisper large-v3**       | 2.2  | Quality-focused, offline    |

_RTF = Real-Time Factor. 0.10 means 10s audio transcribed in 1.0s._

Benchmark methodology:

- WER measured on **raw STT output** (before LLM enhancement)
- Dataset: [FLEURS](https://huggingface.co/datasets/google/fleurs) – native speaker recordings (10 samples × 5 languages)
- Hardware: Apple M1 Pro, sherpa-onnx int8 models
- OpenAI: gpt-4o-transcribe via API

## Performance

Typical processing speed on M1 MacBook Pro:

| Input        | Backend        | Transcription | LLM | Total   |
| ------------ | -------------- | ------------- | --- | ------- |
| 10 min audio | Parakeet       | ~2.5 min      | -   | ~2.5min |
| 10 min audio | Whisper        | ~20 min       | -   | ~20min  |
| 10 min audio | Parakeet + LLM | ~2.5 min      | 20s | ~3min   |

Note: Whisper is slower than realtime on CPU but delivers better accuracy. First invocation has ~5-15s model loading overhead.

## Documentation

For detailed API reference, see the [documentation](https://cuttledoc.dev).

## Development

This is a pnpm monorepo with the following packages:

```
cuttledoc/
├── packages/
│   ├── cuttledoc/     # Core transcription library
│   ├── cli/           # CLI tool (@cuttledoc/cli)
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

- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) - Speech recognition engine
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) - LLM inference
- [@mmomtchev/ffmpeg](https://github.com/mmomtchev/ffmpeg) - Native FFmpeg bindings
- [OpenAI Whisper](https://github.com/openai/whisper) - Speech recognition model
- [OpenAI GPT-4o Transcribe](https://openai.com/index/introducing-our-next-generation-audio-models/) - Next-gen cloud ASR
- [Gemma](https://ai.google.dev/gemma) - Google's open-weight LLM
