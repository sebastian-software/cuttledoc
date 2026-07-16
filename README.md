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
cuttledoc models list
cuttledoc models download <model>
cuttledoc models download all|asr
cuttledoc benchmark [run|report]

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
cuttledoc models download all         # Download all speech models
cuttledoc models download asr         # Alias for "all"

# Download LLM model (for correction/formatting)
# For Ollama (recommended): ollama pull phi4:14b
# For GGUF: cuttledoc models download gemma3n:e4b
```

### Benchmarking

```
cuttledoc benchmark run [models...] [options]
cuttledoc benchmark report [options]

Options:
  --fixtures <dir>    Directory with audio and reference files (default: ./fixtures)
  --output <file>     Benchmark report file (default: <fixtures>/benchmark.json)
  --language <code>   Only benchmark fixtures for one language
```

```bash
# Benchmark all downloaded speech models
cuttledoc benchmark run

# Benchmark one speech model
cuttledoc benchmark run whisper

# Show the latest benchmark report
cuttledoc benchmark report
```

## Backends

- **`auto`** (default): On macOS, Parakeet is selected for its supported languages and Whisper for others. On Linux and Windows, OpenAI is selected when an API key is configured.
- **`parakeet`**: Local CoreML transcription for 25 languages on macOS with Apple Silicon.
- **`whisper`**: Local Whisper large-v3-turbo transcription with 99-language coverage.
- **`openai`**: Cloud transcription with `gpt-4o-transcribe` or `gpt-4o-mini-transcribe`; requires `OPENAI_API_KEY`.

See the [Backends guide](https://sebastian-software.github.io/cuttledoc/docs/backends) for setup, model selection, platform constraints, and privacy considerations.

> **Historical note:** We previously supported Phi-4-multimodal and Canary-1B-v2 via Python,
> but removed them to simplify architecture. See [ADR-001](docs/decisions/001-remove-python-asr-backends.md)
> for the full analysis. The code is preserved in branch `archive/python-asr-backends-2025-01`.

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

Enhancement can run locally with [Ollama](https://ollama.com) or [node-llama-cpp](https://github.com/withcatai/node-llama-cpp), or through OpenAI. See the [LLM guide](https://sebastian-software.github.io/cuttledoc/docs/llm) for provider setup, model selection, cache locations, and long-transcript behavior.

## Benchmarks

Speech-recognition and LLM-correction results, rankings, and methodology now have one canonical source: the [benchmark documentation](https://sebastian-software.github.io/cuttledoc/docs/benchmarks). The CLI can also benchmark downloaded local speech models against your own paired audio and reference fixtures.

## Documentation

Start with the [documentation](https://sebastian-software.github.io/cuttledoc/) or jump to the [CLI reference](https://sebastian-software.github.io/cuttledoc/docs/cli), [backend guide](https://sebastian-software.github.io/cuttledoc/docs/backends), or [API reference](https://sebastian-software.github.io/cuttledoc/docs/api).

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
