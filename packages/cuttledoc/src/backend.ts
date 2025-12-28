import { BACKEND_TYPES, type BackendInfo, type BackendType, PARAKEET_MODELS, WHISPER_MODELS } from "./types.js"

/**
 * Languages supported by Parakeet TDT v3 (25 languages)
 * Source: https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
 */
const PARAKEET_LANGUAGES = [
  "en", // English
  "de", // German
  "fr", // French
  "es", // Spanish
  "it", // Italian
  "pt", // Portuguese
  "nl", // Dutch
  "pl", // Polish
  "cs", // Czech
  "sk", // Slovak
  "hu", // Hungarian
  "ro", // Romanian
  "bg", // Bulgarian
  "el", // Greek
  "sv", // Swedish
  "da", // Danish
  "fi", // Finnish
  "no", // Norwegian
  "hr", // Croatian
  "sl", // Slovenian
  "et", // Estonian
  "lv", // Latvian
  "lt", // Lithuanian
  "mt", // Maltese
  "uk" // Ukrainian
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

  // Parakeet (ONNX - cross-platform, fastest, 25 languages)
  backends.push({
    name: BACKEND_TYPES.parakeet,
    isAvailable: true,
    languages: PARAKEET_LANGUAGES,
    models: Object.keys(PARAKEET_MODELS),
    requiresDownload: true
  })

  // Whisper (cross-platform, 99 languages)
  backends.push({
    name: BACKEND_TYPES.whisper,
    isAvailable: true,
    languages: ["multilingual"], // Whisper supports 99 languages
    models: Object.keys(WHISPER_MODELS),
    requiresDownload: true
  })

  return backends
}

/**
 * Auto-select the best available backend based on language
 */
export function selectBestBackend(language?: string): BackendType {
  // For Parakeet-supported languages, prefer Parakeet (fastest, good quality)
  const langCode = language?.split("-")[0]
  const isParakeetLanguage =
    langCode === undefined || PARAKEET_LANGUAGES.includes(langCode as (typeof PARAKEET_LANGUAGES)[number])

  if (isParakeetLanguage) {
    return BACKEND_TYPES.parakeet
  }

  // Fallback to Whisper for other languages
  return BACKEND_TYPES.whisper
}
