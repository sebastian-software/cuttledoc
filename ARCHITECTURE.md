# Architecture Overview

This document provides a high-level overview of cuttledoc's architecture. For detailed architectural decisions, see [Architecture Decision Records](docs/decisions/).

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Application                      │
│  (CLI or Node.js API)                                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    cuttledoc Core API                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ transcribe(audioPath, options)                       │  │
│  │ enhanceTranscript(text, options)                      │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Backend Selection & Management                       │  │
│  │ - Auto-select best backend                           │  │
│  │ - Lazy loading                                       │  │
│  │ - Instance caching                                   │  │
│  └────────────────────┬─────────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────────┘
                        │
                ┌───────┴───────┐
                │               │
                ▼               ▼
         ┌──────────────┐ ┌──────────────┐
         │Sherpa Backend│ │  LLM Module  │
         │  (ONNX)      │ │  (Gemma 3n)  │
         └──────┬───────┘ └──────┬───────┘
                │                │
                ▼                ▼
         ┌──────────────┐ ┌──────────────┐
         │sherpa-onnx   │ │node-llama-cpp│
         │  Runtime     │ │  Runtime     │
         └──────────────┘ └──────────────┘
```

## Core Components

### 1. Backend System

The backend system provides a unified interface for speech recognition:

- **Sherpa Backend** (`backends/sherpa/`)
  - Cross-platform ONNX runtime via sherpa-onnx
  - Two optimized models:
    - **Parakeet TDT v3** (160 MB) – fastest, 25 European languages
    - **Whisper large-v3** (1.6 GB) – best quality, 99 languages
  - Model download from GitHub Releases and Hugging Face

### 2. Audio Processing

Audio preprocessing pipeline (`utils/audio.ts`):

```
Input File (MP3/MP4/etc.)
    ↓
FFmpeg Demuxer (@mmomtchev/ffmpeg)
    ↓
Audio Decoder (decompress)
    ↓
Audio Transform (resample to 16kHz mono)
    ↓
Float32Array samples → Backend
```

### 3. LLM Enhancement (`@cuttledoc/llm`)

Dedicated package for transcript post-processing. See [packages/llm/README.md](packages/llm/README.md) for full details.

**Providers:**

- **Ollama** (recommended) – Local, easy setup, best quality with phi4:14b
- **node-llama-cpp** – Embedded GGUF models, no external dependencies
- **OpenAI** – Cloud fallback for highest quality

**Processing Modes:**

- `correct` – Fix STT errors, punctuation, sentence boundaries (default)
- `format` – Add Markdown structure, headings, emphasis

**Benchmark Results (January 2025):**

| Model        | WER Improvement | Speed  | Recommendation         |
| ------------ | --------------- | ------ | ---------------------- |
| phi4:14b     | +52%            | 36 t/s | Best quality (default) |
| mistral-nemo | +43%            | 60 t/s | Best speed             |
| gemma3n:e4b  | +41%            | 35 t/s | Most reliable for GGUF |

**Key Learnings:**

1. **Model selection matters significantly** – phi4:14b achieves 52% WER improvement vs 41% for gemma3n
2. **Some models fail catastrophically** – qwen3 produced -75% WER (worse than input) for German/Portuguese
3. **Language-specific performance varies** – phi4 excels at German (+77%), French improvement is limited (+6-38%)
4. **Speed vs quality tradeoff** – mistral-nemo is 67% faster but 9pp less improvement

### 4. CLI Interface

Command-line interface (`cli/`):

- Argument parsing
- Model management commands
- Output formatting
- Progress indicators

## Package Structure

```
cuttledoc/
├── packages/
│   ├── cuttledoc/          # Core library (speech-to-text)
│   │   ├── src/
│   │   │   ├── index.ts           # Public API
│   │   │   ├── backend.ts         # Backend selection
│   │   │   ├── backends/          # Backend implementations
│   │   │   │   ├── sherpa/        # ONNX backend (Whisper/Parakeet)
│   │   │   │   └── openai/        # OpenAI Transcribe API
│   │   │   ├── cli/               # CLI implementation
│   │   │   ├── types.ts           # Type definitions
│   │   │   └── utils/             # Utilities
│   │   └── bin/cuttledoc.js       # CLI wrapper
│   │
│   ├── llm/                # LLM transcript enhancement
│   │   ├── src/
│   │   │   ├── index.ts           # Public API
│   │   │   ├── types.ts           # Types, prompts, models
│   │   │   └── providers/         # Provider implementations
│   │   │       ├── ollama.ts      # Ollama provider
│   │   │       ├── local.ts       # node-llama-cpp (GGUF)
│   │   │       └── openai.ts      # OpenAI provider
│   │   ├── fixtures/              # Benchmark audio/text
│   │   ├── scripts/               # Benchmark scripts
│   │   └── results/               # Benchmark results
│   │
│   ├── ffmpeg/             # FFmpeg audio processing
│   │   └── src/
│   │       └── index.ts           # Audio decode/preprocess
│   │
│   └── docs/               # Documentation website
│       └── content/docs/          # MDX documentation pages
```

## Data Flow

### Transcription Flow

1. **Input**: User provides audio/video file path
2. **Backend Selection**: Auto-select or use specified backend
3. **Audio Preprocessing**: Extract and resample audio to 16kHz mono
4. **Transcription**: Backend processes audio samples
5. **Result**: Return structured transcription with timestamps

### Enhancement Flow (Optional)

1. **Input**: Raw transcription text
2. **LLM Processing**: Send to Gemma 3n model
3. **Enhancement**: Generate summary, format, correct errors
4. **Output**: Enhanced Markdown document

## Key Design Principles

1. **Pluggable Backends**: Easy to add new speech recognition engines
2. **Lazy Loading**: Backends loaded only when needed
3. **Cross-Platform**: Works on Windows, macOS, and Linux
4. **Offline-First**: All processing happens locally
5. **Type Safety**: Full TypeScript coverage
6. **ESM-Only**: Modern JavaScript module system

## Dependencies

### Core Runtime

- `@mmomtchev/ffmpeg` - Native FFmpeg bindings for audio processing
- `sherpa-onnx` - ONNX runtime for speech recognition
- `node-llama-cpp` - LLM inference (optional)

### Build Tools

- `turbo` - Monorepo build orchestration
- `tsup` - TypeScript bundler
- `vitest` - Test runner

## Performance Considerations

- **Backend Caching**: Sherpa backend instances are reused
- **Streaming**: Audio processing uses streams for memory efficiency
- **Model Management**: Models downloaded on-demand and cached

## Extension Points

To add a new backend:

1. Implement the `Backend` interface (`types.ts`)
2. Add backend to `backend.ts` selection logic
3. Update `index.ts` to handle new backend type
4. Add tests and documentation

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Related Documentation

- [Architecture Decision Records](docs/decisions/) - Why we made certain choices
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development guide
- [README.md](README.md) - User documentation
