import { platform } from "node:os"

import {
  BACKEND_TYPES,
  type BackendInfo,
  type BackendType,
  CANARY_MODELS,
  PARAKEET_MODELS,
  WHISPER_MODELS
} from "./types.js"

/**
 * Supported EU languages for Parakeet/Canary models
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

/**
 * Languages supported by Apple Speech Framework (partial list)
 */
const APPLE_LANGUAGES = [
  "en",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "nl",
  "pl",
  "ja",
  "zh",
  "ko",
  "ar",
  "ru",
  "uk",
  "th",
  "vi",
  "id",
  "ms",
  "tr",
  "he",
  "hi",
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
  "sl"
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
 * Check if running on macOS
 */
function isMacOS(): boolean {
  return platform() === "darwin"
}

/**
 * Get list of available backends on this system
 */
export function getAvailableBackends(): readonly BackendInfo[] {
  const backends: BackendInfo[] = []

  // Apple Speech (macOS only)
  if (isMacOS()) {
    backends.push({
      name: BACKEND_TYPES.apple,
      isAvailable: true,
      languages: APPLE_LANGUAGES,
      models: ["default"],
      requiresDownload: false
    })
  }

  // Parakeet (ONNX - cross-platform)
  backends.push({
    name: BACKEND_TYPES.parakeet,
    isAvailable: true,
    languages: EU_LANGUAGES,
    models: Object.keys(PARAKEET_MODELS),
    requiresDownload: true
  })

  // Canary (ONNX - cross-platform)
  backends.push({
    name: BACKEND_TYPES.canary,
    isAvailable: true,
    languages: EU_LANGUAGES,
    models: Object.keys(CANARY_MODELS),
    requiresDownload: true
  })

  // Whisper (cross-platform fallback)
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
  // Prefer Apple on macOS (fastest, no download needed)
  if (isMacOS()) {
    return BACKEND_TYPES.apple
  }

  // For EU languages, prefer Parakeet (fastest ONNX model)
  const langCode = language?.split("-")[0]
  const isEuLanguage = langCode === undefined || EU_LANGUAGES.includes(langCode as (typeof EU_LANGUAGES)[number])

  if (isEuLanguage) {
    return BACKEND_TYPES.parakeet
  }

  // Fallback to Whisper for other languages
  return BACKEND_TYPES.whisper
}
