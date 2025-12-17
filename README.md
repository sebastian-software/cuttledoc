<p align="center">
  <img src="packages/docs/app/assets/logo.svg" width="150" height="150" alt="cuttledoc logo">
</p>

<h1 align="center">cuttledoc</h1>

<p align="center">
  <strong>Fast, offline speech-to-text transcription for Node.js with multiple backend support.</strong>
</p>

[![CI](https://github.com/sebastian-software/cuttledoc/actions/workflows/ci.yml/badge.svg)](https://github.com/sebastian-software/cuttledoc/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/cuttledoc.svg)](https://www.npmjs.com/package/cuttledoc)
[![npm downloads](https://img.shields.io/npm/dm/cuttledoc.svg)](https://www.npmjs.com/package/cuttledoc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10%2B-orange.svg)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/cuttledoc)](https://bundlephobia.com/package/cuttledoc)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/sebastian-software/cuttledoc)

## Features

- 🎤 **Multiple Backends**: Apple Speech (macOS only), Whisper, Parakeet
- 🚀 **Native Performance**: No Python, no subprocess overhead
- 📱 **Offline**: All processing happens locally
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
# Basic transcription
npx cuttledoc video.mp4

# With LLM enhancement (adds formatting, TLDR, corrections)
npx cuttledoc podcast.mp3 --enhance -o transcript.md

# Use specific backend and language
npx cuttledoc meeting.m4a -b apple -l de

# Show processing statistics
npx cuttledoc audio.wav --stats
```

### API

```typescript
import { transcribe } from "cuttledoc"

const result = await transcribe("audio.mp3", {
  language: "en",
  backend: "auto" // auto, apple, whisper, parakeet
})

console.log(result.text)
console.log(`Duration: ${result.durationSeconds}s`)
console.log(`Confidence: ${result.confidence}`)
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
  -b, --backend <name>    Backend: auto, apple, whisper, parakeet (default: auto)
  -l, --language <code>   Language code: en, de, fr, es, etc.
  -o, --output <file>     Write output to file
  -e, --enhance           Enhance with LLM (formatting + corrections)
  --correct-only          Only fix transcription errors, no formatting
  --llm-model <name>      LLM model (default: gemma3n:e4b)
  -s, --stats             Show processing statistics
  -q, --quiet             Minimal output
  -h, --help              Show help
  -v, --version           Show version
```

### Model Management

```bash
# List available models
cuttledoc models list

# Download a speech model
cuttledoc models download whisper-medium
cuttledoc models download parakeet-tdt-0.6b-v3

# Download LLM model
cuttledoc models download gemma3n:e4b
```

## Backends

| Backend          | Platform  | Speed  | Quality | Languages |
| ---------------- | --------- | ------ | ------- | --------- |
| Apple Speech     | macOS 14+ | ⚡⚡⚡ | ★★★★    | 60+       |
| Whisper (medium) | All       | ⚡⚡   | ★★★★★   | 99        |
| Parakeet v3      | All       | ⚡⚡⚡ | ★★★★    | 26 (EU)   |

### Backend Selection

- **`auto`** (default): Apple Speech on macOS, Whisper elsewhere
- **`apple`**: Native macOS Speech Framework, fastest, on-device
- **`whisper`**: OpenAI Whisper via sherpa-onnx, best multilingual
- **`parakeet`**: NVIDIA Parakeet v3, fast and accurate for 26 EU languages

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

All processing happens locally using [node-llama-cpp](https://github.com/withcatai/node-llama-cpp).

## Performance

Typical processing speed on M1 MacBook Pro:

| Input        | Backend     | Transcription | LLM | Total |
| ------------ | ----------- | ------------- | --- | ----- |
| 10 min audio | Apple       | 15s           | -   | 15s   |
| 10 min audio | Whisper     | 45s           | -   | 45s   |
| 10 min audio | Apple + LLM | 15s           | 20s | 35s   |

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
- [Whisper](https://github.com/openai/whisper) - OpenAI's speech recognition model
- [Gemma](https://ai.google.dev/gemma) - Google's open-weight LLM
