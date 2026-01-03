# @cuttledoc/llm

LLM-based transcript correction and enhancement for cuttledoc.

## Features

- **Transcript Correction**: Fix STT errors, improve punctuation, reconstruct sentences
- **Optional Formatting**: Add Markdown structure (headings, lists, emphasis)
- **Multiple Providers**: Ollama (local), node-llama-cpp (GGUF), OpenAI (cloud)
- **Offline-First**: Works entirely locally with Ollama or GGUF models

## Installation

```bash
pnpm add @cuttledoc/llm
```

### Requirements

For local inference, install one of:

```bash
# Option 1: Ollama (recommended)
brew install ollama
ollama pull phi4:14b

# Option 2: GGUF models are auto-downloaded on first use
```

## Quick Start

```typescript
import { enhanceTranscript } from "@cuttledoc/llm"

// Correct transcription errors
const result = await enhanceTranscript(rawTranscript, {
  mode: "correct" // Fix errors without changing structure
})
console.log(result.plainText)

// Full formatting with Markdown
const formatted = await enhanceTranscript(rawTranscript, {
  mode: "format" // Add headings, structure, emphasis
})
console.log(formatted.markdown)
```

## Providers

### Ollama (Recommended)

Best balance of quality and ease of use.

```typescript
import { enhanceTranscript } from "@cuttledoc/llm"

const result = await enhanceTranscript(text, {
  provider: "ollama",
  model: "phi4:14b" // default, best quality
})
```

### node-llama-cpp (GGUF)

For embedded use without external dependencies.

```typescript
const result = await enhanceTranscript(text, {
  provider: "local",
  model: "gemma3n:e4b" // default for GGUF
})
```

### OpenAI (Cloud)

For highest quality when latency isn't critical.

```typescript
const result = await enhanceTranscript(text, {
  provider: "openai",
  model: "gpt-5-mini"
})
```

## Benchmark Results

Tested on TTS-generated audio (5-7 min per language, 2 speakers each) across DE, EN, ES, FR, PT.

### Model Comparison

| Model                  | Avg WER Before | Avg WER After | Improvement | Speed  |
| ---------------------- | -------------- | ------------- | ----------- | ------ |
| **phi4:14b** (default) | 5.6%           | **2.8%**      | **+52.0%**  | 36 t/s |
| **mistral-nemo**       | 5.6%           | 3.2%          | +42.7%      | 60 t/s |
| gemma3n:e4b            | 5.6%           | 3.3%          | +41.2%      | 35 t/s |
| gemma3n:e2b            | 5.6%           | 3.6%          | +36.9%      | 44 t/s |

### Per-Language Results (phi4:14b)

| Language | Before | After | Change |
| -------- | ------ | ----- | ------ |
| 🇩🇪 DE    | 6.7%   | 1.6%  | -5.1pp |
| 🇬🇧 EN    | 5.5%   | 2.8%  | -2.7pp |
| 🇪🇸 ES    | 3.5%   | 1.3%  | -2.2pp |
| 🇫🇷 FR    | 6.5%   | 5.7%  | -0.8pp |
| 🇧🇷 PT    | 6.0%   | 3.3%  | -2.7pp |

### Key Findings

1. **phi4:14b is best for quality** – 52% average WER improvement, especially strong for German (+77%) and Spanish (+65%)

2. **mistral-nemo is fastest** – 60 tokens/sec with good quality (+43%)

3. **gemma3n:e4b is most reliable** – No negative outliers across any language

4. **qwen3 is NOT recommended** – Catastrophic results for German and Portuguese (-75% WER, worse than input)

### Recommendations

- **Default**: Use `phi4:14b` via Ollama for best results
- **Speed-critical**: Use `mistral-nemo` (60 t/s vs 36 t/s)
- **Low-memory**: Use `gemma3n:e2b` (2GB RAM)
- **Embedded/GGUF**: Use `gemma3n:e4b` (tested, reliable)

## Available Models

### Ollama Models

| Model          | Size  | Description                           |
| -------------- | ----- | ------------------------------------- |
| `phi4:14b`     | 9 GB  | Best correction quality (+52% WER)    |
| `mistral-nemo` | 8 GB  | Fastest (60 t/s), strong EU languages |
| `gemma3n:e4b`  | 7.5GB | Reliable, no outliers                 |
| `gemma3n:e2b`  | 5.6GB | Ultra-efficient                       |

### GGUF Models (node-llama-cpp)

| Model              | Size  | Description                     |
| ------------------ | ----- | ------------------------------- |
| `gemma3n:e4b`      | 4.5GB | Best tested GGUF (+41% WER)     |
| `gemma3n:e2b`      | 2.5GB | Ultra-efficient (+37% WER)      |
| `mistral-nemo:12b` | 7GB   | Fastest, strong EU langs        |
| `phi4-mini`        | 2.5GB | Compact (use Ollama for better) |

## API Reference

### `enhanceTranscript(text, options?)`

Main function to correct/enhance transcripts.

```typescript
interface EnhanceOptions {
  provider?: "ollama" | "local" | "openai" // default: auto-detect
  model?: string // default: phi4:14b (Ollama) or gemma3n:e4b (GGUF)
  mode?: "correct" | "format" // default: "correct"
  temperature?: number // default: 0.2
}

interface EnhanceResult {
  plainText: string // Corrected text
  markdown: string // Formatted with Markdown (if mode="format")
  stats: {
    correctionsCount: number
    processingTimeMs: number
    tokensPerSecond: number
  }
}
```

### Provider Detection

The library auto-detects available providers:

1. **Ollama** – If `ollama` is running locally
2. **OpenAI** – If `OPENAI_API_KEY` is set
3. **Local** – Falls back to node-llama-cpp with GGUF models

### Utility Functions

```typescript
// Check provider availability
import { isOllamaRunning, hasOpenAIKey, hasModelsDirectory } from "@cuttledoc/llm"

// Download GGUF model
import { downloadModel, isModelDownloaded } from "@cuttledoc/llm"

await downloadModel("gemma3n:e4b")

// List Ollama models
import { listOllamaModels, hasOllamaModel } from "@cuttledoc/llm"
```

## Development

```bash
# Run benchmark
pnpm benchmark

# Build
pnpm build

# Test
pnpm test
```

## License

MIT
