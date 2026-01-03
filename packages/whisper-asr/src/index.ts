/**
 * @cuttledoc/whisper-asr
 *
 * Whisper ASR for Node.js with CoreML acceleration on Apple Silicon.
 * Based on whisper.cpp with ANE (Apple Neural Engine) support.
 */

import { createRequire } from "node:module"

// Dynamic require for native addon (works in both ESM and CJS)
const require = createRequire(import.meta.url)

interface NativeAddon {
  initialize(options: { modelPath: string; language?: string; translate?: boolean; threads?: number }): boolean
  isInitialized(): boolean
  transcribe(samples: Float32Array, sampleRate: number): NativeTranscriptionResult
  cleanup(): void
  getVersion(): { addon: string; whisper: string; coreml: string }
}

interface NativeTranscriptionResult {
  text: string
  language: string
  durationMs: number
  segments: Array<{
    startMs: number
    endMs: number
    text: string
    confidence: number
  }>
}

// Try to load native addon
let addon: NativeAddon | null = null
let loadError: Error | null = null

try {
  addon = require("bindings")("whisper_asr") as NativeAddon
} catch (error) {
  loadError = error instanceof Error ? error : new Error(String(error))
}

/**
 * Check if Whisper ASR is available on this platform
 */
export function isAvailable(): boolean {
  return addon !== null && process.platform === "darwin" && process.arch === "arm64"
}

/**
 * Get the load error if the addon failed to load
 */
export function getLoadError(): Error | null {
  return loadError
}

/**
 * Transcription segment with timestamps
 */
export interface TranscriptionSegment {
  /** Start time in milliseconds */
  startMs: number
  /** End time in milliseconds */
  endMs: number
  /** Transcribed text for this segment */
  text: string
  /** Confidence score (0-1) */
  confidence: number
}

/**
 * Transcription result
 */
export interface TranscriptionResult {
  /** Full transcribed text */
  text: string
  /** Detected or specified language (ISO code) */
  language: string
  /** Processing time in milliseconds */
  durationMs: number
  /** Individual segments with timestamps */
  segments: TranscriptionSegment[]
}

/**
 * Whisper ASR engine options
 */
export interface WhisperAsrOptions {
  /** Path to the Whisper model file (ggml format) */
  modelPath: string
  /** Language code (e.g., "en", "de", "fr") or "auto" for auto-detection */
  language?: string
  /** Translate to English (default: false) */
  translate?: boolean
  /** Number of threads (0 = auto) */
  threads?: number
}

/**
 * Whisper ASR Engine with CoreML acceleration
 *
 * @example
 * ```typescript
 * const engine = new WhisperAsrEngine({
 *   modelPath: "./models/whisper/ggml-large-v3-turbo.bin"
 * });
 *
 * await engine.initialize();
 * const result = await engine.transcribe(audioSamples, 16000);
 * console.log(result.text);
 * ```
 */
export class WhisperAsrEngine {
  private options: WhisperAsrOptions
  private initialized = false

  constructor(options: WhisperAsrOptions) {
    if (!isAvailable()) {
      throw new Error(
        `Whisper ASR is only available on macOS ARM64. ` +
          `Current platform: ${process.platform}/${process.arch}. ` +
          (loadError ? `Load error: ${loadError.message}` : "")
      )
    }
    this.options = options
  }

  /**
   * Initialize the Whisper engine
   * This loads the model into memory - may take a few seconds for large models.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    if (!addon) {
      throw new Error("Native addon not loaded")
    }

    const success = addon.initialize({
      modelPath: this.options.modelPath,
      language: this.options.language ?? "auto",
      translate: this.options.translate ?? false,
      threads: this.options.threads ?? 0
    })

    if (!success) {
      throw new Error("Failed to initialize Whisper engine")
    }

    this.initialized = true
  }

  /**
   * Check if the engine is ready for transcription
   */
  isReady(): boolean {
    return this.initialized && addon?.isInitialized() === true
  }

  /**
   * Transcribe audio samples
   *
   * @param samples - Float32Array of audio samples (mono)
   * @param sampleRate - Sample rate in Hz (e.g., 16000, 44100, 48000)
   * @returns Transcription result with text and optional segments
   */
  async transcribe(samples: Float32Array, sampleRate: number = 16000): Promise<TranscriptionResult> {
    if (!this.isReady() || !addon) {
      throw new Error("Whisper engine not initialized. Call initialize() first.")
    }

    // Run transcription (synchronous in native code, but we wrap in Promise for consistency)
    const result = addon.transcribe(samples, sampleRate)

    return {
      text: result.text,
      language: result.language,
      durationMs: result.durationMs,
      segments: result.segments
    }
  }

  /**
   * Clean up resources and unload the model
   */
  cleanup(): void {
    if (addon && this.initialized) {
      addon.cleanup()
      this.initialized = false
    }
  }

  /**
   * Get version information
   */
  getVersion(): { addon: string; whisper: string; coreml: string } {
    if (!addon) {
      return { addon: "unknown", whisper: "unknown", coreml: "unknown" }
    }
    return addon.getVersion()
  }
}

/**
 * Available Whisper models
 */
export const WHISPER_MODELS = {
  // Tiny models - fastest, lowest accuracy
  tiny: { size: "75 MB", languages: "multilingual" },
  "tiny.en": { size: "75 MB", languages: "English only" },

  // Base models - good balance
  base: { size: "142 MB", languages: "multilingual" },
  "base.en": { size: "142 MB", languages: "English only" },

  // Small models - better accuracy
  small: { size: "466 MB", languages: "multilingual" },
  "small.en": { size: "466 MB", languages: "English only" },

  // Medium models - high accuracy
  medium: { size: "1.5 GB", languages: "multilingual" },
  "medium.en": { size: "1.5 GB", languages: "English only" },

  // Large models - best accuracy
  "large-v2": { size: "2.9 GB", languages: "multilingual" },
  "large-v3": { size: "2.9 GB", languages: "multilingual" },
  "large-v3-turbo": { size: "1.5 GB", languages: "multilingual, optimized" }
} as const

export type WhisperModel = keyof typeof WHISPER_MODELS
