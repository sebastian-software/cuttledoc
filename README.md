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
- 🚀 **Native Performance**: No Python for core backends, optional Python for Phi-4/Canary
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
# Basic transcription (uses local Parakeet)
npx cuttledoc video.mp4

# With LLM enhancement (adds formatting, TLDR, corrections)
npx cuttledoc podcast.mp3 --enhance -o transcript.md

# Use specific backend and language
npx cuttledoc meeting.m4a -b parakeet -l de

# Use OpenAI cloud API (best quality)
export OPENAI_API_KEY=sk-...
npx cuttledoc meeting.m4a -b openai

# Or pass API key directly
npx cuttledoc meeting.m4a -b openai --api-key sk-...

# Show processing statistics
npx cuttledoc audio.wav --stats
```

### API

```typescript
import { transcribe } from "cuttledoc"

// Local transcription (offline)
const result = await transcribe("audio.mp3", {
  language: "en",
  backend: "auto" // auto, whisper, parakeet, phi4
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

# Download speech models
cuttledoc models download parakeet-tdt-0.6b-v3   # 160 MB, 25 languages
cuttledoc models download whisper-large-v3       # 1.6 GB, 99 languages

# Download LLM model (for --enhance)
cuttledoc models download gemma3n:e4b
```

## Backends

### Local Backends (Offline, No API Key)

| Backend                   | Speed    | Avg WER | Languages | Size   | Requires    |
| ------------------------- | -------- | ------- | --------- | ------ | ----------- |
| **Parakeet v3** (default) | 4x RT    | 6.4%    | 25        | 160 MB | Node.js     |
| **Whisper large-v3**      | 0.45x RT | 5.1%    | 99        | 1.6 GB | Node.js     |
| **Phi-4-multimodal**      | ~1x RT   | ~4%     | 8         | 12 GB  | Python, GPU |
| **Canary-1B-v2**          | ~2x RT   | ~4%     | 26        | 1 GB   | Python, GPU |

### Cloud Backends (Requires API Key)

| Backend                    | Speed    | Quality | Languages | Cost        |
| -------------------------- | -------- | ------- | --------- | ----------- |
| **gpt-4o-transcribe**      | ⚡⚡⚡   | ★★★★★+  | 50+       | ~$0.006/min |
| **gpt-4o-mini-transcribe** | ⚡⚡⚡⚡ | ★★★★★   | 50+       | ~$0.003/min |

OpenAI's next-generation audio models offer improved WER (Word Error Rate) over local Whisper:

- Better language recognition and accuracy
- Handles accents and challenging audio better
- See: [Introducing next-generation audio models](https://openai.com/index/introducing-our-next-generation-audio-models/)

### Backend Selection

- **`auto`** (default): Parakeet for 25 supported languages, Whisper for all others
- **`parakeet`**: NVIDIA Parakeet TDT v3 – fastest, excellent for English/German/European languages
- **`whisper`**: OpenAI Whisper large-v3 – best quality, 99 languages including Asian/Arabic
- **`openai`**: OpenAI cloud API – best accuracy, requires `OPENAI_API_KEY`
- **`phi4`**: Microsoft Phi-4-multimodal – best accuracy for EN/DE/ES (requires Python + MPS/CUDA)
- **`canary`**: NVIDIA Canary-1B-v2 – excellent for EU languages including RU/UK (requires Python + CUDA)

### Why These Models?

We offer multiple backends for different use cases:

**Local (Offline):**

1. **Parakeet v3** – Best speed-to-quality ratio for common languages (160 MB, 4x realtime)
2. **Whisper large-v3** – Full multilingual model, 99 languages (1.6 GB, 0.45x realtime)
3. **Phi-4-multimodal** – Lowest WER for: EN, DE, FR, ES, IT, PT, ZH, JA (~12 GB, 1x realtime)
4. **Canary-1B-v2** – NVIDIA's latest, 26 EU languages + RU/UK (~1 GB, fast on CUDA)

**Cloud (Requires API Key):** 5. **gpt-4o-transcribe** – OpenAI's best, improved WER over Whisper, 50+ languages 6. **gpt-4o-mini-transcribe** – Faster and cheaper, still better than Whisper

> **Note on Distil-Whisper**: The distilled Whisper models (`distil-large-v3`, `distil-large-v3.5`)
> are [English-only](https://huggingface.co/distil-whisper) and ignore the language parameter.
> We use the full `whisper-large-v3` for true multilingual support.

### Python Backend Requirements (Phi-4, Canary)

To use the `phi4` or `canary` backends, you need Python with the appropriate libraries:

**Phi-4:**

```bash
pip install torch transformers librosa soundfile
```

- ~12GB model, downloaded automatically from Hugging Face
- Best on Apple Silicon (MPS) or NVIDIA GPU (CUDA)

**Canary:**

```bash
pip install "nemo_toolkit[asr] @ git+https://github.com/NVIDIA/NeMo.git"
```

- ~1GB model, downloaded automatically
- Best on NVIDIA GPU (CUDA), CPU fallback available

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

All processing happens locally using [node-llama-cpp](https://github.com/withcatai/node-llama-cpp).

## Quality Benchmark

Word Error Rate (WER) on [FLEURS](https://huggingface.co/datasets/google/fleurs) native speaker recordings (lower is better):

| Backend               | 🇬🇧 EN | 🇩🇪 DE | 🇫🇷 FR | 🇪🇸 ES | 🇧🇷 PT | Avg WER | RTF   |
| --------------------- | ----- | ----- | ----- | ----- | ----- | ------- | ----- |
| **Parakeet v3**       | 4.6%  | 4.5%  | 10.1% | 3.6%  | 9.0%  | 6.4%    | 0.24  |
| **Whisper large-v3**  | 4.9%  | 2.8%  | 10.6% | 2.1%  | 5.2%  | 5.1%    | 2.2   |
| **gpt-4o-transcribe** | ~4%   | ~3%   | ~5%   | ~2%   | ~4%   | ~3.5%   | cloud |

_Parakeet v3 supports [25 European languages](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3). gpt-4o-transcribe values are estimates. RTF = Real-Time Factor (lower = faster)._

### 🏆 Ranking by Accuracy

| Rank | Backend               | Avg WER | Best for                           |
| ---- | --------------------- | ------- | ---------------------------------- |
| 🥇   | **gpt-4o-transcribe** | ~3.5%   | Production, critical transcripts   |
| 🥈   | **Whisper large-v3**  | 5.1%    | Offline, broadest language support |
| 🥉   | **Parakeet v3**       | 6.4%    | Fast + accurate, 25 European langs |

### ⚡ Ranking by Speed

| Rank | Backend               | Speed    | Best for                    |
| ---- | --------------------- | -------- | --------------------------- |
| 🥇   | **Parakeet v3**       | 4x RT    | Real-time, batch processing |
| 🥈   | **Whisper large-v3**  | 0.45x RT | Quality-focused, offline    |
| 🥉   | **gpt-4o-transcribe** | cloud    | Depends on network latency  |

_Speed = relative to real-time (4x RT means 10s audio transcribed in ~2.5s)_

Benchmark methodology:

- WER measured on **raw STT output** (before LLM enhancement)
- Dataset: [FLEURS](https://huggingface.co/datasets/google/fleurs) – native speaker recordings (5 samples per language)
- Hardware: Apple M1 Pro, sherpa-onnx int8 models
- Run your own: `node /tmp/benchmark-wer.js` (after creating WAV files from OGG fixtures)

## Performance

Typical processing speed on M1 MacBook Pro:

| Input        | Backend        | Transcription | LLM | Total   |
| ------------ | -------------- | ------------- | --- | ------- |
| 10 min audio | Parakeet       | ~2.5 min      | -   | ~2.5min |
| 10 min audio | Whisper        | ~20 min       | -   | ~20min  |
| 10 min audio | Phi-4 (MPS)    | ~10 min       | -   | ~10min  |
| 10 min audio | Parakeet + LLM | ~2.5 min      | 20s | ~3min   |

Note: Whisper is slower than realtime on CPU but delivers better accuracy. Phi-4 runs near real-time on Apple Silicon (MPS) or NVIDIA GPU. First invocation has ~5-15s model loading overhead.

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
- [Phi-4-multimodal](https://huggingface.co/microsoft/Phi-4-multimodal-instruct) - Microsoft's multimodal LLM
- [Canary-1B-v2](https://huggingface.co/nvidia/canary-1b-v2) - NVIDIA's multilingual ASR model
- [Gemma](https://ai.google.dev/gemma) - Google's open-weight LLM
