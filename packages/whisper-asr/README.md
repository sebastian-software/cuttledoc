# @cuttledoc/whisper-asr

OpenAI Whisper ASR for Node.js with **CoreML acceleration** on Apple Silicon.

Based on [whisper.cpp](https://github.com/ggerganov/whisper.cpp) with Apple Neural Engine (ANE) support for optimal performance on M1/M2/M3/M4 Macs.

## Features

- 🚀 **Metal GPU + CoreML/ANE** acceleration (pick best for your Mac)
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
| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| `tiny` | 75 MB | Fastest | Basic |
| `base` | 142 MB | Fast | Good |
| `small` | 466 MB | Medium | Better |
| `medium` | 1.5 GB | Slow | High |
| `large-v3` | 2.9 GB | Slowest | Best |
| `large-v3-turbo` | 1.5 GB | Fast | Near-best |

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

// Transcribe audio (Float32Array, mono, any sample rate)
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

## Hardware Acceleration

This package supports **two acceleration backends**:

### Metal GPU (Default)

Uses the Apple GPU - excellent on all Apple Silicon Macs, especially those with many GPU cores (M1 Max/Ultra, M2 Max/Ultra, M3 Max).

### CoreML/ANE (Optional)

Uses the **Apple Neural Engine** (ANE) - a dedicated ML accelerator. Benefits depend on your Mac generation:

| Generation | ANE TOPS | GPU Cores | Best Backend           |
| ---------- | -------- | --------- | ---------------------- |
| M1/M2      | 15-32    | 8-64      | Metal GPU often faster |
| M3         | 35       | 10-40     | Comparable             |
| **M4/M5**  | 38-50+   | 16-20     | **CoreML/ANE faster**  |

> 💡 **TL;DR:** On M4 Pro and newer, CoreML/ANE shines because the ANE improved faster than the GPU.

### Enabling CoreML/ANE

1. Generate CoreML encoder model (requires Python 3.11):

```bash
cd vendor/whisper.cpp
pip install ane_transformers openai-whisper coremltools
./models/generate-coreml-model.sh large-v3-turbo
```

2. The encoder model (`ggml-large-v3-turbo-encoder.mlmodelc`) is loaded automatically if present.

### Real-World Benchmarks

Tested on M1 Ultra (64 GPU cores), 4-second audio with `large-v3-turbo`:

| Backend    | Time       | Notes                   |
| ---------- | ---------- | ----------------------- |
| Metal GPU  | **508 ms** | Fastest on this Mac     |
| CoreML/ANE | 713 ms     | ANE saturated, GPU idle |

On M4 Pro (estimated, based on ANE improvements):

| Backend    | Time        | Notes           |
| ---------- | ----------- | --------------- |
| Metal GPU  | ~600 ms     | Fewer GPU cores |
| CoreML/ANE | **~400 ms** | ANE 2x faster   |

_Your mileage may vary. Both backends produce identical transcriptions._

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

## Comparison with @cuttledoc/coreml-asr

| Feature      | whisper-asr           | coreml-asr                |
| ------------ | --------------------- | ------------------------- |
| Model        | Whisper (OpenAI)      | Parakeet-TDT (NVIDIA)     |
| Languages    | 99                    | 25 European               |
| Architecture | Encoder-Decoder       | RNN-T/TDT                 |
| Model Size   | 75MB - 2.9GB          | 600MB                     |
| Best For     | Accuracy, translation | Speed, European languages |

## License

MIT

## Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov
- [OpenAI Whisper](https://github.com/openai/whisper) by OpenAI
