import {
  BACKEND_TYPES,
  type BackendInfo,
  type BackendType,
  PARAKEET_LANGUAGES,
  PARAKEET_MODELS,
  WHISPER_LANGUAGES,
  WHISPER_MODELS
} from "./types.js"
import { resolveApiKey } from "./utils/api-key.js"

let currentBackend: BackendType = BACKEND_TYPES.auto

/**
 * Set the default backend for transcription
 */
export function setBackend(backend: BackendType): void {
  currentBackend = backend
}

/**
 * Get the currently configured backend
 */
export function getBackend(): BackendType {
  return currentBackend
}

/**
 * Get list of available backends on this system
 */
export function getAvailableBackends(): readonly BackendInfo[] {
  const backends: BackendInfo[] = []

  // Check if we're on macOS (required for CoreML)
  const isMacOS = process.platform === "darwin"

  // Parakeet (CoreML - macOS only, fastest, 25 languages)
  backends.push({
    name: BACKEND_TYPES.parakeet,
    isAvailable: isMacOS,
    languages: PARAKEET_LANGUAGES,
    models: Object.keys(PARAKEET_MODELS),
    requiresDownload: true
  })

  // Whisper (CoreML - macOS only, 99 languages)
  backends.push({
    name: BACKEND_TYPES.whisper,
    isAvailable: isMacOS,
    languages: WHISPER_LANGUAGES,
    models: Object.keys(WHISPER_MODELS),
    requiresDownload: true
  })

  // OpenAI (cloud, requires API key)
  backends.push({
    name: BACKEND_TYPES.openai,
    isAvailable: true, // Actual check requires API key
    languages: ["multilingual"], // 50+ languages
    models: ["gpt-4o-transcribe", "gpt-4o-mini-transcribe"],
    requiresDownload: false
  })

  return backends
}

/**
 * Auto-select the best available backend based on platform, credentials, and language
 */
export function selectBestBackend(language?: string, apiKey?: string): BackendType {
  if (process.platform !== "darwin") {
    const resolvedApiKey = resolveApiKey(apiKey, process.env["OPENAI_API_KEY"])
    if (resolvedApiKey !== undefined) {
      return BACKEND_TYPES.openai
    }

    throw new Error(
      `Automatic backend selection is unavailable on ${process.platform}: local CoreML backends require macOS. ` +
        'Set OPENAI_API_KEY or provide options.apiKey, then use backend "openai" (CLI: -b openai).'
    )
  }

  // For Parakeet-supported languages, prefer Parakeet (fastest, good quality)
  const langCode = language?.split("-")[0]
  const isParakeetLanguage = langCode === undefined || (PARAKEET_LANGUAGES as readonly string[]).includes(langCode)

  if (isParakeetLanguage) {
    return BACKEND_TYPES.parakeet
  }

  // Fallback to Whisper for other languages
  return BACKEND_TYPES.whisper
}
