/**
 * LLM-based transcript enhancement
 *
 * Uses node-llama-cpp for native Node.js LLM inference.
 * Supports Gemma 3n, Gemma 3, DeepSeek R1, Qwen 2.5 and other GGUF models.
 */

export {
  downloadModel,
  enhanceTranscript,
  isModelDownloaded,
  LLMProcessor,
} from "./processor.js";

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
  type ProcessMode,
} from "./types.js";

