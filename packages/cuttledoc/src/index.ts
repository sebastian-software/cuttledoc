import { getAvailableBackends, getBackend, selectBestBackend, setBackend } from "./backend.js"
import {
  BACKEND_TYPES,
  OPENAI_TRANSCRIBE_MODELS,
  PARAKEET_MODELS,
  WHISPER_MODELS,
  type Backend,
  type BackendInfo,
  type BackendOptions,
  type BackendType,
  type OpenAITranscribeModel,
  type ParakeetModel,
  type PartialResult,
  type TranscribeOptions,
  type TranscriptionResult,
  type TranscriptionSegment,
  type WhisperModel,
  type WordTimestamp
} from "./types.js"

import type { OpenAIBackend } from "./backends/openai/index.js"
import type { SherpaBackend, SherpaModelType } from "./backends/sherpa/index.js"

// Re-export core types and functions
export { getAvailableBackends, getBackend, selectBestBackend, setBackend }
export { BACKEND_TYPES, OPENAI_TRANSCRIBE_MODELS, PARAKEET_MODELS, WHISPER_MODELS }
export type {
  Backend,
  BackendInfo,
  BackendOptions,
  BackendType,
  OpenAITranscribeModel,
  ParakeetModel,
  PartialResult,
  TranscribeOptions,
  TranscriptionResult,
  TranscriptionSegment,
  WhisperModel,
  WordTimestamp
}

// Re-export sherpa types and functions for CLI
export {
  SHERPA_MODELS,
  SHERPA_MODEL_TYPES,
  type SherpaModelType,
  type SherpaModelInfo
} from "./backends/sherpa/types.js"
export {
  downloadSherpaModel,
  isModelDownloaded as isSherpaModelDownloaded,
  getAvailableModels as getAvailableSherpaModels,
  downloadVadModel,
  isVadModelDownloaded
} from "./backends/sherpa/download.js"

// Re-export LLM types for CLI
export { LLM_MODELS, type LLMModelId, downloadLLMModel, isLLMModelDownloaded } from "./llm/index.js"

// Cached backend instances
const sherpaBackendCache = new Map<SherpaModelType, SherpaBackend>()
let openaiBackendInstance: OpenAIBackend | null = null

/**
 * Get or create a cached Sherpa backend instance
 */
async function getOrCreateSherpaBackend(model: SherpaModelType): Promise<SherpaBackend> {
  let backend = sherpaBackendCache.get(model)
  if (backend === undefined) {
    const { SherpaBackend } = await import("./backends/sherpa/index.js")
    backend = new SherpaBackend({ model })
    await backend.initialize()
    sherpaBackendCache.set(model, backend)
  }
  return backend
}

/**
 * Get or create an OpenAI backend instance
 */
async function getOrCreateOpenAIBackend(apiKey: string | undefined): Promise<OpenAIBackend> {
  if (openaiBackendInstance === null) {
    const { OpenAIBackend } = await import("./backends/openai/index.js")
    openaiBackendInstance = new OpenAIBackend(apiKey ? { apiKey } : undefined)
    await openaiBackendInstance.initialize()
  }
  return openaiBackendInstance
}

/**
 * Transcribe an audio file using the configured or best available backend
 *
 * @param audioPath - Path to the audio file to transcribe
 * @param options - Transcription options
 * @returns Promise resolving to the transcription result
 */
export async function transcribe(audioPath: string, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
  const currentBackend = getBackend()
  const backend: BackendType =
    options.backend ?? (currentBackend === BACKEND_TYPES.auto ? selectBestBackend(options.language) : currentBackend)

  switch (backend) {
    case BACKEND_TYPES.parakeet: {
      const parakeetBackend = await getOrCreateSherpaBackend("parakeet-tdt-0.6b-v3")
      return parakeetBackend.transcribe(audioPath, options)
    }

    case BACKEND_TYPES.whisper: {
      const whisperBackend = await getOrCreateSherpaBackend("whisper-large-v3")
      return whisperBackend.transcribe(audioPath, options)
    }

    case BACKEND_TYPES.openai: {
      const apiKey = "apiKey" in options ? options.apiKey : undefined
      const openaiBackend = await getOrCreateOpenAIBackend(apiKey)
      return openaiBackend.transcribe(audioPath, options)
    }

    case BACKEND_TYPES.auto: {
      // This should never happen as we resolve 'auto' above
      throw new Error("Unexpected 'auto' backend - this is a bug")
    }
  }
}

/** Default models for each backend (only local backends that need downloads) */
const DEFAULT_MODELS: Record<Exclude<BackendType, "auto" | "openai">, string> = {
  parakeet: "parakeet-tdt-0.6b-v3",
  whisper: "whisper-large-v3"
}

/**
 * Download a model for the specified backend
 *
 * @param backend - Backend to download model for
 * @param model - Specific model variant to download (defaults to recommended model for backend)
 */
export async function downloadModel(backend: BackendType, model?: string): Promise<void> {
  switch (backend) {
    case BACKEND_TYPES.parakeet:
    case BACKEND_TYPES.whisper: {
      const { downloadSherpaModel } = await import("./backends/sherpa/download.js")
      const defaultModel = DEFAULT_MODELS[backend]
      await downloadSherpaModel(model ?? defaultModel)
      return
    }

    case BACKEND_TYPES.openai: {
      // OpenAI is a cloud service, no download needed
      return
    }

    case BACKEND_TYPES.auto: {
      throw new Error("Cannot download model for 'auto' backend - specify a backend explicitly")
    }
  }
}

/**
 * Clean up all cached backend instances
 */
export async function cleanup(): Promise<void> {
  const disposePromises: Promise<void>[] = []

  // Dispose Sherpa backends
  for (const backend of sherpaBackendCache.values()) {
    disposePromises.push(backend.dispose())
  }
  sherpaBackendCache.clear()

  // Dispose OpenAI backend
  if (openaiBackendInstance !== null) {
    disposePromises.push(openaiBackendInstance.dispose())
    openaiBackendInstance = null
  }

  await Promise.all(disposePromises)
}
