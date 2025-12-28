import { BACKEND_TYPES, type BackendInfo, type BackendType, PARAKEET_MODELS, WHISPER_MODELS } from "./types.js"

/**
 * Supported EU languages for Parakeet models
 */
const EU_LANGUAGES = [
  "en",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "nl",
  "pl",
  "cs",
  "sk",
  "hu",
  "ro",
  "bg",
  "el",
  "sv",
  "da",
  "fi",
  "no",
  "hr",
  "sl",
  "et",
  "lv",
  "lt",
  "mt",
  "ru",
  "uk"
] as const

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

  // Parakeet (ONNX - cross-platform, fastest for EU languages)
  backends.push({
    name: BACKEND_TYPES.parakeet,
    isAvailable: true,
    languages: EU_LANGUAGES,
    models: Object.keys(PARAKEET_MODELS),
    requiresDownload: true
  })

  // Whisper (cross-platform, supports 99 languages)
  backends.push({
    name: BACKEND_TYPES.whisper,
    isAvailable: true,
    languages: EU_LANGUAGES, // Simplified - Whisper supports 99 languages
    models: Object.keys(WHISPER_MODELS),
    requiresDownload: true
  })

  return backends
}

/**
 * Auto-select the best available backend based on system and language
 */
export function selectBestBackend(language?: string): BackendType {
  // For EU languages, prefer Parakeet (fastest, good quality)
  const langCode = language?.split("-")[0]
  const isEuLanguage = langCode === undefined || EU_LANGUAGES.includes(langCode as (typeof EU_LANGUAGES)[number])

  if (isEuLanguage) {
    return BACKEND_TYPES.parakeet
  }

  // Fallback to Whisper for other languages
  return BACKEND_TYPES.whisper
}
