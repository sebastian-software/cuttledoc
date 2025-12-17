# Architecture Overview

This document provides a high-level overview of cuttledoc's architecture. For detailed architectural decisions, see [DECISIONS.md](DECISIONS.md).

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
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Apple Backend│ │Sherpa Backend│ │  LLM Module  │
│  (macOS)     │ │  (ONNX)      │ │  (Gemma 3n)  │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│Speech.framework│ │sherpa-onnx  │ │node-llama-cpp│
│  (Native)     │ │  Runtime     │ │  Runtime     │
└───────────────┘ └──────────────┘ └──────────────┘
```

## Core Components

### 1. Backend System

The backend system provides a unified interface for multiple speech recognition engines:

- **Apple Backend** (`backends/apple/`)
  - Native macOS Speech Framework integration
  - N-API bindings with Objective-C++
  - Fastest option on macOS, no model downloads

- **Sherpa Backend** (`backends/sherpa/`)
  - Cross-platform ONNX runtime
  - Supports Whisper, Parakeet, and Canary models
  - Model download and management

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

### 3. LLM Enhancement

Optional post-processing (`llm/`):

- Uses Gemma 3n model via node-llama-cpp
- Generates TLDR summaries
- Formats text with Markdown
- Fixes transcription errors
- Runs entirely offline

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
│   ├── cuttledoc/          # Core library
│   │   ├── src/
│   │   │   ├── index.ts           # Public API
│   │   │   ├── backend.ts         # Backend selection
│   │   │   ├── backends/          # Backend implementations
│   │   │   │   ├── apple/         # macOS native backend
│   │   │   │   ├── sherpa/        # ONNX backend (Whisper/Parakeet)
│   │   │   │   └── whisper/       # (placeholder)
│   │   │   ├── cli/               # CLI implementation
│   │   │   ├── llm/               # LLM enhancement
│   │   │   ├── types/             # Type definitions
│   │   │   └── utils/             # Utilities (audio processing)
│   │   └── binding.gyp            # Native module build config
│   └── docs/              # Documentation website
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
- **Native Modules**: Apple backend uses native code for best performance
- **Model Management**: Models downloaded on-demand and cached

## Extension Points

To add a new backend:

1. Implement the `Backend` interface (`types.ts`)
2. Add backend to `backend.ts` selection logic
3. Update `index.ts` to handle new backend type
4. Add tests and documentation

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Related Documentation

- [DECISIONS.md](DECISIONS.md) - Architecture Decision Records
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development guide
- [README.md](README.md) - User documentation
