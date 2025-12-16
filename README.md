# local-transcribe

> Fast, offline speech-to-text transcription for Node.js with multiple backend support.

[![CI](https://github.com/your-username/local-transcribe/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/local-transcribe/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/local-transcribe.svg)](https://www.npmjs.com/package/local-transcribe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎤 **Multiple Backends**: Apple Speech (macOS), Whisper, Parakeet
- 🚀 **Native Performance**: No Python, no subprocess overhead
- 📱 **Offline**: All processing happens locally
- 🎬 **Video Support**: Extract audio from MP4, WebM, MKV
- 🤖 **LLM Enhancement**: Auto-correct and format transcripts with Gemma 3n
- 📊 **Detailed Stats**: Processing time, word count, confidence scores

## Installation

```bash
npm install local-transcribe
```

### Requirements

- Node.js 24+
- macOS 14+ (for Apple Speech backend)
- ~2GB disk space for models

## Quick Start

### CLI

```bash
# Basic transcription
npx local-transcribe video.mp4

# With LLM enhancement (adds formatting, TLDR, corrections)
npx local-transcribe podcast.mp3 --enhance -o transcript.md

# Use specific backend and language
npx local-transcribe meeting.m4a -b apple -l de

# Show processing statistics
npx local-transcribe audio.wav --stats
```

### API

```typescript
import { transcribe } from "local-transcribe";

const result = await transcribe("audio.mp3", {
  language: "en",
  backend: "auto", // auto, apple, whisper, parakeet
});

console.log(result.text);
console.log(`Duration: ${result.durationSeconds}s`);
console.log(`Confidence: ${result.confidence}`);
```

### With LLM Enhancement

```typescript
import { transcribe } from "local-transcribe";
import { enhanceTranscript } from "local-transcribe/llm";

const result = await transcribe("podcast.mp3");

const enhanced = await enhanceTranscript(result.text, {
  model: "gemma3n:e4b",
  mode: "enhance", // or "correct" for minimal changes
});

console.log(enhanced.markdown);
// ## TLDR
// Brief summary of the content...
//
// ## Main Content
// **Important point** discussed here...
```

## CLI Reference

```
local-transcribe <audio-file> [options]
local-transcribe models [list|download <model>]

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
local-transcribe models list

# Download a speech model
local-transcribe models download whisper-medium
local-transcribe models download parakeet-tdt-0.6b-v3

# Download LLM model
local-transcribe models download gemma3n:e4b
```

## Backends

| Backend | Platform | Speed | Quality | Languages |
|---------|----------|-------|---------|-----------|
| Apple Speech | macOS 14+ | ⚡⚡⚡ | ★★★★ | 60+ |
| Whisper (medium) | All | ⚡⚡ | ★★★★★ | 99 |
| Parakeet v3 | All | ⚡⚡⚡ | ★★★★ | EN |

### Backend Selection

- **`auto`** (default): Apple Speech on macOS, Whisper elsewhere
- **`apple`**: Native macOS Speech Framework, fastest, on-device
- **`whisper`**: OpenAI Whisper via sherpa-onnx, best multilingual
- **`parakeet`**: NVIDIA Parakeet, fast and accurate for English

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
   - *Italic* for emphasis
   - `##` Headings for topic changes
   - Bullet lists where appropriate
4. Fix obvious **transcription errors**

All processing happens locally using [node-llama-cpp](https://github.com/withcatai/node-llama-cpp).

## Performance

Typical processing speed on M1 MacBook Pro:

| Input | Backend | Transcription | LLM | Total |
|-------|---------|---------------|-----|-------|
| 10 min audio | Apple | 15s | - | 15s |
| 10 min audio | Whisper | 45s | - | 45s |
| 10 min audio | Apple + LLM | 15s | 20s | 35s |

## API Reference

### `transcribe(audioPath, options?)`

```typescript
interface TranscribeOptions {
  language?: string;      // e.g., "en", "de-DE"
  backend?: BackendType;  // "auto" | "apple" | "whisper" | "parakeet"
  onProgress?: (partial: PartialResult) => void;
}

interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  durationSeconds: number;
  backend: string;
  language?: string;
  confidence?: number;
}
```

### `enhanceTranscript(text, options?)`

```typescript
interface LLMProcessOptions {
  model?: LLMModelId;     // "gemma3n:e4b" | "gemma3:4b" | ...
  mode?: "enhance" | "correct";
  temperature?: number;
  chunkSize?: number;
}

interface LLMProcessResult {
  markdown: string;
  plainText: string;
  stats: {
    correctionsCount: number;
    paragraphCount: number;
    processingTimeMs: number;
  };
}
```

## Development

```bash
# Clone
git clone https://github.com/your-username/local-transcribe
cd local-transcribe

# Install
npm install

# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

## Architecture

```
local-transcribe
├── src/
│   ├── index.ts          # Main API entry point
│   ├── backend.ts        # Backend selection logic
│   ├── types.ts          # Core TypeScript types
│   ├── backends/
│   │   ├── apple/        # macOS Speech Framework (N-API)
│   │   └── sherpa/       # sherpa-onnx (Whisper, Parakeet)
│   ├── llm/
│   │   ├── processor.ts  # LLM enhancement (node-llama-cpp)
│   │   └── types.ts      # LLM types and prompts
│   ├── utils/
│   │   └── audio.ts      # FFmpeg audio preprocessing
│   └── cli/
│       └── index.ts      # CLI entry point
└── DECISIONS.md          # Architecture Decision Records
```

## License

MIT © [Your Name]

## Acknowledgments

- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) - Speech recognition engine
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) - LLM inference
- [@mmomtchev/ffmpeg](https://github.com/mmomtchev/ffmpeg) - Native FFmpeg bindings
- [Whisper](https://github.com/openai/whisper) - OpenAI's speech recognition model
- [Gemma](https://ai.google.dev/gemma) - Google's open-weight LLM

