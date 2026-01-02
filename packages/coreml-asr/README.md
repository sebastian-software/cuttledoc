# @cuttledoc/coreml-asr

CoreML-based Automatic Speech Recognition for Apple Silicon using the Parakeet TDT v3 model.

## Features

- 🍎 **Native Apple Silicon support** - Uses CoreML for optimal performance on M1/M2/M3/M4
- 🌍 **Multilingual** - Supports 25 European languages
- ⚡ **Fast** - ~110x real-time factor on M4 Pro
- 🔒 **Private** - Fully offline, no data leaves your device
- 📦 **Node.js Native Addon** - Seamless integration with Node.js/TypeScript

## Requirements

- macOS 14.0 or later
- Apple Silicon (M1/M2/M3/M4) recommended
- Node.js 22+
- Xcode Command Line Tools

## Installation

```bash
pnpm add @cuttledoc/coreml-asr
```

## Model Setup

Download the CoreML models from HuggingFace:

```bash
# Clone the model repository
git lfs install
git clone https://huggingface.co/FluidInference/parakeet-tdt-0.6b-v3-coreml models/parakeet-coreml

# Or download specific files you need
```

Required model files:

- `Encoder.mlmodelc` (or `ParakeetEncoder_15s.mlmodelc`)
- `Decoder.mlmodelc` (or `ParakeetDecoder.mlmodelc`)
- `JointDecision.mlmodelc`
- `vocab.txt` (or `tokens.txt`)

Optional:

- `Melspectrogram_15s.mlmodelc` - For hardware-accelerated mel spectrogram computation

## Usage

```typescript
import { CoreMLAsrEngine } from '@cuttledoc/coreml-asr'

// Initialize the engine
const engine = new CoreMLAsrEngine({
  modelDir: './models/parakeet-coreml'
})

await engine.initialize()

// Transcribe audio samples (16kHz, mono, Float32)
const audioSamples = new Float32Array([...]) // Your audio data
const result = await engine.transcribe(audioSamples, 16000)

console.log(result.text)
console.log(`Processed in ${result.durationMs}ms`)

// Clean up when done
engine.cleanup()
```

## API Reference

### `CoreMLAsrEngine`

#### Constructor

```typescript
new CoreMLAsrEngine(options: AsrEngineOptions)
```

- `options.modelDir` - Path to directory containing CoreML models

#### Methods

- `initialize(): Promise<void>` - Load models and prepare for transcription
- `isReady(): boolean` - Check if engine is ready
- `transcribe(samples: Float32Array, sampleRate?: number): Promise<TranscriptionResult>` - Transcribe audio
- `cleanup(): void` - Release resources
- `getVersion(): { addon: string; model: string; coreml: string }` - Get version info

### Helper Functions

- `isAvailable(): boolean` - Check if CoreML ASR is supported on this platform
- `getDefaultModelDir(): string` - Get default model directory path

## Supported Languages

Bulgarian, Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French,
German, Greek, Hungarian, Italian, Latvian, Lithuanian, Maltese, Norwegian,
Polish, Portuguese, Romanian, Slovak, Slovenian, Spanish, Swedish, Ukrainian

## Performance

On Apple Silicon:

- **M4 Pro**: ~110x real-time (1 minute audio ≈ 0.5 seconds)
- **M1**: ~50-70x real-time

## Architecture

```
┌─────────────────┐
│   Node.js API   │  TypeScript wrapper
├─────────────────┤
│  Native Addon   │  N-API + Objective-C++
├─────────────────┤
│    CoreML       │  ANE / GPU / CPU
├─────────────────┤
│ Parakeet TDT v3 │  ONNX → CoreML models
└─────────────────┘
```

## License

MIT

## Credits

- Model: [NVIDIA Parakeet TDT v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)
- CoreML conversion: [FluidInference](https://huggingface.co/FluidInference/parakeet-tdt-0.6b-v3-coreml)
