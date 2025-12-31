/**
 * LLM-based transcript enhancement
 *
 * This module re-exports from @cuttledoc/llm for backward compatibility.
 *
 * @see @cuttledoc/llm for full documentation
 */

// Re-export everything from @cuttledoc/llm
export {
  // Main API
  enhanceTranscript,
  detectProvider,
  isLLMAvailable,

  // Providers
  OllamaProcessor,
  OpenAIProcessor,
  LocalProcessor,

  // Ollama utilities
  enhanceWithOllama,
  hasOllamaModel,
  isOllamaRunning,
  listOllamaModels,

  // OpenAI utilities
  enhanceWithOpenAI,
  hasOpenAIKey,

  // Local utilities
  downloadModel,
  enhanceWithLocal,
  hasModelsDirectory,
  isModelDownloaded,

  // Types
  countParagraphs,
  findCorrections,
  stripMarkdown,
  TRANSCRIPT_CORRECTION_PROMPT,
  TRANSCRIPT_ENHANCEMENT_PROMPT,

  // Model configs
  LOCAL_MODELS,
  OLLAMA_MODELS,
  OPENAI_MODELS,
  PROCESS_MODES,

  // Type exports
  type Correction,
  type EnhanceOptions,
  type EnhanceResult,
  type LLMProvider,
  type LocalModelId,
  type OllamaModelId,
  type OpenAIModelId,
  type ProcessMode
} from "@cuttledoc/llm"

// Legacy aliases for backward compatibility
export { LOCAL_MODELS as LLM_MODELS, type LocalModelId as LLMModelId } from "@cuttledoc/llm"
export { downloadModel as downloadLLMModel, isModelDownloaded as isLLMModelDownloaded } from "@cuttledoc/llm"
export type { EnhanceResult as LLMProcessResult, EnhanceOptions as LLMProcessOptions } from "@cuttledoc/llm"
