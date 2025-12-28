import { getAvailableBackends, getBackend, selectBestBackend, setBackend } from "./backend.js"
import {
  BACKEND_TYPES,
  PARAKEET_MODELS,
  WHISPER_MODELS,
  type Backend,
  type BackendInfo,
  type BackendOptions,
  type BackendType,
  type ParakeetModel,
  type PartialResult,
  type TranscribeOptions,
  type TranscriptionResult,
  type TranscriptionSegment,
  type WhisperModel,
  type WordTimestamp
} from "./types.js"

import type { SherpaBackend, SherpaModelType } from "./backends/sherpa/index.js"

// Re-export core types and functions
export { getAvailableBackends, getBackend, selectBestBackend, setBackend }
export { BACKEND_TYPES, PARAKEET_MODELS, WHISPER_MODELS }
export type {
  Backend,
  BackendInfo,
  BackendOptions,
  BackendType,
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
  getAvailableModels as getAvailableSherpaModels
} from "./backends/sherpa/download.js"

// Re-export LLM types for CLI
export { LLM_MODELS, type LLMModelId } from "./llm/types.js"
export { downloadModel as downloadLLMModel, isModelDownloaded as isLLMModelDownloaded } from "./llm/processor.js"

// Cached backend instances by model type
const backendCache = new Map<SherpaModelType, SherpaBackend>()

/**
 * Get or create a cached backend instance for a model
 */
async function getOrCreateBackend(model: SherpaModelType): Promise<SherpaBackend> {
  let backend = backendCache.get(model)
  if (backend === undefined) {
    const { SherpaBackend } = await import("./backends/sherpa/index.js")
    backend = new SherpaBackend({ model })
    await backend.initialize()
    backendCache.set(model, backend)
  }
  return backend
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
      const parakeetBackend = await getOrCreateBackend("parakeet-tdt-0.6b-v3")
      return parakeetBackend.transcribe(audioPath, options)
    }

    case BACKEND_TYPES.whisper: {
      const whisperBackend = await getOrCreateBackend("whisper-medium")
      return whisperBackend.transcribe(audioPath, options)
    }

    case BACKEND_TYPES.auto: {
      // This should never happen as we resolve 'auto' above
      throw new Error("Unexpected 'auto' backend - this is a bug")
    }
  }
}

/** Default models for each backend */
const DEFAULT_MODELS: Record<Exclude<BackendType, "auto">, string> = {
  parakeet: "parakeet-tdt-0.6b-v3",
  whisper: "whisper-medium"
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
  for (const backend of backendCache.values()) {
    disposePromises.push(backend.dispose())
  }
  await Promise.all(disposePromises)
  backendCache.clear()
}
