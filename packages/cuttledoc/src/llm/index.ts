/**
 * LLM-based transcript enhancement
 *
 * Primary: Ollama (recommended) - just `ollama pull gemma3:4b`
 * Fallback: node-llama-cpp for environments without Ollama
 */

// Ollama backend (recommended)
export {
  enhanceWithOllama,
  hasOllamaModel,
  isOllamaRunning,
  listOllamaModels,
  OLLAMA_MODELS,
  OllamaProcessor,
  type OllamaModelId
} from "./ollama.js"

// node-llama-cpp backend (fallback)
export { downloadModel, enhanceTranscript, hasModelsDirectory, LLMProcessor } from "./processor.js"

// Shared types
export {
  countParagraphs,
  findCorrections,
  LLM_MODELS,
  PROCESS_MODES,
  stripMarkdown,
  TRANSCRIPT_CORRECTION_PROMPT,
  TRANSCRIPT_ENHANCEMENT_PROMPT,
  type LLMModelId,
  type LLMProcessOptions,
  type LLMProcessResult,
  type ProcessMode
} from "./types.js"
