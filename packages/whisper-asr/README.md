# @cuttledoc/whisper-asr

OpenAI Whisper ASR for Node.js with **CoreML/ANE acceleration** on Apple Silicon.

Based on [whisper.cpp](https://github.com/ggerganov/whisper.cpp) with Apple Neural Engine (ANE) support for optimal performance on M1/M2/M3/M4 Macs.

## Features

- 🚀 **CoreML/ANE accelerated** - runs on Apple Neural Engine
- 🌍 **99 languages** supported (Whisper multilingual)
- 📝 **Word-level timestamps** for subtitles/captions
- 🔄 **Translation** to English from any language
- 💻 **macOS ARM64 only** - optimized for Apple Silicon

## Installation

```bash
pnpm add @cuttledoc/whisper-asr
```

### Prerequisites

1. **Build whisper.cpp** (first time only):

```bash
cd packages/whisper-asr
npm run prepare:whisper
```

2. **Download a model**:

```bash
npm run download:model large-v3-turbo
```

Available models:

| Model            | Size   | Speed   | Accuracy  |
| ---------------- | ------ | ------- | --------- |
| `tiny`           | 75 MB  | Fastest | Basic     |
| `base`           | 142 MB | Fast    | Good      |
| `small`          | 466 MB | Medium  | Better    |
| `medium`         | 1.5 GB | Slow    | High      |
| `large-v3`       | 2.9 GB | Slowest | Best      |
| `large-v3-turbo` | 1.5 GB | Fast    | Near-best |

## Usage

```typescript
import { WhisperAsrEngine, isAvailable } from "@cuttledoc/whisper-asr"

// Check availability
if (!isAvailable()) {
  console.log("Whisper ASR requires macOS ARM64")
  process.exit(1)
}

// Initialize engine
const engine = new WhisperAsrEngine({
  modelPath: "./models/whisper/ggml-large-v3-turbo.bin",
  language: "auto" // or "en", "de", "fr", etc.
})

await engine.initialize()

// Transcribe audio (Float32Array, mono, 16kHz)
const result = await engine.transcribe(audioSamples, 16000)

console.log(result.text)
// "Ask not what your country can do for you..."

console.log(result.language)
// "en"

console.log(result.segments)
// [{ startMs: 0, endMs: 3200, text: "Ask not...", confidence: 0.95 }, ...]

// Clean up
engine.cleanup()
```

### With Translation

```typescript
const engine = new WhisperAsrEngine({
  modelPath: "./models/whisper/ggml-large-v3-turbo.bin",
  language: "de", // German audio
  translate: true // Translate to English
})
```

## API Reference

### `WhisperAsrEngine`

#### Constructor Options

| Option      | Type      | Default  | Description             |
| ----------- | --------- | -------- | ----------------------- |
| `modelPath` | `string`  | required | Path to ggml model file |
| `language`  | `string`  | `"auto"` | Language code or "auto" |
| `translate` | `boolean` | `false`  | Translate to English    |
| `threads`   | `number`  | `0`      | CPU threads (0 = auto)  |

#### Methods

- `initialize(): Promise<void>` - Load the model
- `transcribe(samples, sampleRate): Promise<TranscriptionResult>` - Transcribe audio
- `isReady(): boolean` - Check if ready
- `cleanup(): void` - Release resources
- `getVersion(): VersionInfo` - Get version info

### `TranscriptionResult`

```typescript
interface TranscriptionResult {
  text: string // Full transcription
  language: string // Detected language
  durationMs: number // Processing time
  segments: TranscriptionSegment[] // With timestamps
}
```

## License

MIT

## Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov
- [OpenAI Whisper](https://github.com/openai/whisper) by OpenAI
