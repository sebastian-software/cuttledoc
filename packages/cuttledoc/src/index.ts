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
import type { CoreMLBackend, CoreMLModelType } from "./backends/coreml/index.js"

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

// Re-export CoreML types and functions
export {
  COREML_MODELS,
  COREML_MODEL_TYPES,
  type CoreMLModelType,
  type CoreMLModelInfo
} from "./backends/coreml/index.js"

// Re-export LLM types for CLI
export {
  LOCAL_MODELS,
  type LocalModelId,
  downloadModel as downloadLLMModel,
  isModelDownloaded as isLLMModelDownloaded
} from "@cuttledoc/llm"

// Cached backend instances
const coremlBackendCache = new Map<string, CoreMLBackend>()
let openaiBackendInstance: OpenAIBackend | null = null

/**
 * Get or create a cached CoreML backend instance
 */
async function getOrCreateCoreMLBackend(model: CoreMLModelType, language?: string): Promise<CoreMLBackend> {
  const cacheKey = model === BACKEND_TYPES.whisper ? `${model}:${language ?? "auto"}` : model
  let backend = coremlBackendCache.get(cacheKey)
  if (backend === undefined) {
    const { CoreMLBackend } = await import("./backends/coreml/index.js")
    backend = new CoreMLBackend({ model })
    await backend.initialize(language)
    coremlBackendCache.set(cacheKey, backend)
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
  const requestedBackend = options.backend ?? getBackend()
  const backend: BackendType =
    requestedBackend === BACKEND_TYPES.auto ? selectBestBackend(options.language) : requestedBackend

  switch (backend) {
    case BACKEND_TYPES.parakeet: {
      const parakeetBackend = await getOrCreateCoreMLBackend("parakeet", options.language)
      return parakeetBackend.transcribe(audioPath, options)
    }

    case BACKEND_TYPES.whisper: {
      const whisperBackend = await getOrCreateCoreMLBackend("whisper", options.language)
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

/**
 * Download models for the specified backend
 *
 * @param backend - Backend to download model for
 */
export async function downloadModel(backend: BackendType): Promise<void> {
  switch (backend) {
    case BACKEND_TYPES.parakeet: {
      const { downloadModels } = await import("parakeet-coreml")
      await downloadModels()
      // VAD model is downloaded automatically on first transcribe()
      return
    }

    case BACKEND_TYPES.whisper: {
      const { downloadModel: downloadWhisperModel } = await import("whisper-coreml")
      // Downloads both bin and CoreML model if available
      await downloadWhisperModel()
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
 * Check if models are downloaded for a backend
 */
export async function isModelDownloaded(backend: BackendType): Promise<boolean> {
  switch (backend) {
    case BACKEND_TYPES.parakeet: {
      const { areModelsDownloaded } = await import("parakeet-coreml")
      return areModelsDownloaded()
    }

    case BACKEND_TYPES.whisper: {
      const { isModelDownloaded: isWhisperModelDownloaded } = await import("whisper-coreml")
      return isWhisperModelDownloaded()
    }

    case BACKEND_TYPES.openai: {
      return true // No download needed
    }

    case BACKEND_TYPES.auto: {
      return false
    }
  }
}

/**
 * Clean up all cached backend instances
 */
export async function cleanup(): Promise<void> {
  const disposePromises: Promise<void>[] = []

  // Dispose CoreML backends
  for (const backend of coremlBackendCache.values()) {
    disposePromises.push(backend.dispose())
  }
  coremlBackendCache.clear()

  // Dispose OpenAI backend
  if (openaiBackendInstance !== null) {
    disposePromises.push(openaiBackendInstance.dispose())
    openaiBackendInstance = null
  }

  await Promise.all(disposePromises)
}
