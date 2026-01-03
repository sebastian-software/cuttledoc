# @cuttledoc/parakeet-asr

Parakeet TDT ASR for Apple Silicon with CoreML/ANE acceleration.

## Features

- 🍎 **Native Apple Silicon** - Uses CoreML/ANE for optimal performance
- 🌍 **Multilingual** - Supports major European languages
- ⚡ **Fast** - ~110x real-time on M4 Pro
- 🔒 **Private** - Fully offline, no data leaves your device

## Requirements

- macOS 14.0+
- Apple Silicon (M1/M2/M3/M4)
- Node.js 22+

## Installation

```bash
pnpm add @cuttledoc/parakeet-asr
```

## Model Setup

Download the CoreML models from HuggingFace:

```bash
git lfs install
git clone https://huggingface.co/FluidInference/parakeet-tdt-0.6b-v3-coreml models/parakeet
```

## Usage

```typescript
import { ParakeetAsrEngine } from "@cuttledoc/parakeet-asr"

const engine = new ParakeetAsrEngine({
  modelDir: "./models/parakeet"
})

await engine.initialize()

// Transcribe audio (16kHz, mono, Float32)
const result = await engine.transcribe(audioSamples, 16000)

console.log(result.text)
console.log(`Processed in ${result.durationMs}ms`)

engine.cleanup()
```

## API Reference

### `ParakeetAsrEngine`

```typescript
new ParakeetAsrEngine({ modelDir: string })
```

#### Methods

- `initialize(): Promise<void>` - Load models
- `isReady(): boolean` - Check if ready
- `transcribe(samples, sampleRate?): Promise<TranscriptionResult>` - Transcribe audio
- `cleanup(): void` - Release resources

### Helper Functions

- `isAvailable(): boolean` - Check platform support

## Architecture

```
┌─────────────────┐
│   Node.js API   │  TypeScript
├─────────────────┤
│  Native Addon   │  N-API + Objective-C++
├─────────────────┤
│    CoreML       │  ANE accelerated
└─────────────────┘
```

## License

MIT

## Credits

- Model: [NVIDIA Parakeet TDT v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)
- CoreML: [FluidInference](https://huggingface.co/FluidInference/parakeet-tdt-0.6b-v3-coreml)
