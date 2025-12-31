/**
 * @cuttledoc/llm - LLM-based transcript enhancement
 *
 * Supports multiple providers:
 * - Ollama (local, recommended) - `ollama pull gemma3:4b`
 * - OpenAI (cloud) - requires OPENAI_API_KEY
 * - Local (node-llama-cpp) - downloads GGUF models automatically
 *
 * @example
 * ```typescript
 * import { enhanceTranscript } from '@cuttledoc/llm'
 *
 * // Auto-detect provider (Ollama → OpenAI → Local)
 * const result = await enhanceTranscript(transcript)
 *
 * // Use specific provider
 * const local = await enhanceTranscript(transcript, { provider: 'ollama' })
 * const cloud = await enhanceTranscript(transcript, { provider: 'openai' })
 * ```
 */

// Types
export {
  countParagraphs,
  findCorrections,
  LOCAL_MODELS,
  OLLAMA_MODELS,
  OPENAI_MODELS,
  PROCESS_MODES,
  stripMarkdown,
  TRANSCRIPT_CORRECTION_PROMPT,
  TRANSCRIPT_ENHANCEMENT_PROMPT,
  type Correction,
  type EnhanceOptions,
  type EnhanceResult,
  type LLMProvider,
  type LocalModelId,
  type OllamaModelId,
  type OpenAIModelId,
  type ProcessMode
} from "./types.js"

// Ollama Provider
export {
  enhanceWithOllama,
  hasOllamaModel,
  isOllamaRunning,
  listOllamaModels,
  OllamaProcessor
} from "./providers/ollama.js"

// OpenAI Provider
export { enhanceWithOpenAI, hasOpenAIKey, OpenAIProcessor } from "./providers/openai.js"

// Local Provider (node-llama-cpp)
export {
  downloadModel,
  enhanceWithLocal,
  hasModelsDirectory,
  isModelDownloaded,
  LocalProcessor
} from "./providers/local.js"

import { isOllamaRunning, OllamaProcessor } from "./providers/ollama.js"
import { hasOpenAIKey, OpenAIProcessor } from "./providers/openai.js"
import { LocalProcessor } from "./providers/local.js"
import type { EnhanceOptions, EnhanceResult, LLMProvider, LocalModelId, ProcessMode } from "./types.js"

/**
 * Detect the best available provider
 */
export async function detectProvider(): Promise<LLMProvider | null> {
  // 1. Try Ollama (preferred - local, no API keys)
  if (await isOllamaRunning()) {
    return "ollama"
  }

  // 2. Try OpenAI (cloud fallback)
  if (hasOpenAIKey()) {
    return "openai"
  }

  // 3. Try local (requires node-llama-cpp)
  try {
    await import("node-llama-cpp")
    return "local"
  } catch {
    // node-llama-cpp not available
  }

  return null
}

/**
 * Enhance a transcript using the best available provider
 *
 * Provider priority:
 * 1. Ollama (if running)
 * 2. OpenAI (if OPENAI_API_KEY is set)
 * 3. Local (if node-llama-cpp is installed)
 *
 * @example
 * ```typescript
 * // Auto-detect provider
 * const result = await enhanceTranscript("raw transcript text")
 *
 * // Use specific provider
 * const result = await enhanceTranscript("text", { provider: 'openai' })
 *
 * // Correction-only mode (no restructuring)
 * const result = await enhanceTranscript("text", { mode: 'correct' })
 * ```
 */
export async function enhanceTranscript(transcript: string, options: EnhanceOptions = {}): Promise<EnhanceResult> {
  // Determine provider
  let provider = options.provider

  if (provider === undefined) {
    const detected = await detectProvider()
    if (detected === null) {
      throw new Error(
        "No LLM provider available. Install Ollama (brew install ollama), " +
          "set OPENAI_API_KEY, or install node-llama-cpp."
      )
    }
    provider = detected
  }

  // Build common enhance options (filter out undefined values)
  const enhanceOpts: { mode?: ProcessMode; temperature?: number } = {}
  if (options.mode !== undefined) enhanceOpts.mode = options.mode
  if (options.temperature !== undefined) enhanceOpts.temperature = options.temperature

  // Create processor based on provider
  switch (provider) {
    case "ollama": {
      const processorOpts: { model?: string } = {}
      if (options.model !== undefined) processorOpts.model = options.model
      const processor = new OllamaProcessor(processorOpts)
      return processor.enhance(transcript, enhanceOpts)
    }

    case "openai": {
      const processorOpts: { model?: string; apiKey?: string } = {}
      if (options.model !== undefined) processorOpts.model = options.model
      if (options.apiKey !== undefined) processorOpts.apiKey = options.apiKey
      const processor = new OpenAIProcessor(processorOpts)
      return processor.enhance(transcript, enhanceOpts)
    }

    case "local": {
      const processorOpts: {
        model?: LocalModelId
        modelPath?: string
        gpuLayers?: number
        contextSize?: number
      } = {}
      if (options.model !== undefined) processorOpts.model = options.model as LocalModelId
      if (options.modelPath !== undefined) processorOpts.modelPath = options.modelPath
      if (options.gpuLayers !== undefined) processorOpts.gpuLayers = options.gpuLayers
      if (options.contextSize !== undefined) processorOpts.contextSize = options.contextSize
      const processor = new LocalProcessor(processorOpts)

      try {
        await processor.initialize()
        return await processor.enhanceChunked(transcript, enhanceOpts)
      } finally {
        await processor.dispose()
      }
    }

    default:
      throw new Error(`Unknown provider: ${provider as string}`)
  }
}

/**
 * Check if any LLM provider is available
 */
export async function isLLMAvailable(): Promise<boolean> {
  const provider = await detectProvider()
  return provider !== null
}
