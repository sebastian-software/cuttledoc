/**
 * CoreML backend for macOS speech recognition
 *
 * Uses parakeet-coreml and whisper-coreml for Neural Engine accelerated transcription.
 * macOS only - leverages Apple Silicon's dedicated ML hardware.
 */

import type { ParakeetAsrEngine } from "parakeet-coreml"
import { SUPPORTED_LANGUAGES as PARAKEET_LANGUAGES } from "parakeet-coreml"
import type { WhisperAsrEngine } from "whisper-coreml"
import { SUPPORTED_LANGUAGES as WHISPER_LANGUAGES } from "whisper-coreml"

import { decodeAudio, isFFmpegAvailable } from "@cuttledoc/ffmpeg"

import {
  BACKEND_TYPES,
  type Backend,
  type TranscribeOptions,
  type TranscriptionResult,
  type TranscriptionSegment
} from "../../types.js"
import { normalizeAudio } from "../../utils/audio.js"

/**
 * CoreML model types
 */
export const COREML_MODEL_TYPES = {
  parakeet: "parakeet",
  whisper: "whisper"
} as const

export type CoreMLModelType = (typeof COREML_MODEL_TYPES)[keyof typeof COREML_MODEL_TYPES]

/**
 * Model metadata
 */
export interface CoreMLModelInfo {
  id: CoreMLModelType
  name: string
  languages: readonly string[]
  speed: string
}

export const COREML_MODELS: Record<CoreMLModelType, CoreMLModelInfo> = {
  parakeet: {
    id: "parakeet",
    name: "Parakeet TDT 0.6B v3",
    languages: PARAKEET_LANGUAGES,
    speed: "40x real-time"
  },
  whisper: {
    id: "whisper",
    name: "Whisper large-v3-turbo",
    languages: WHISPER_LANGUAGES,
    speed: "14x real-time"
  }
}

/**
 * CoreML Backend for macOS
 *
 * Supports:
 * - Parakeet: Fast, 25 European languages, 40x real-time
 * - Whisper: Accurate, 99 languages, 14x real-time
 */
export class CoreMLBackend implements Backend {
  private modelType: CoreMLModelType
  private parakeetEngine: ParakeetAsrEngine | null = null
  private whisperEngine: WhisperAsrEngine | null = null
  private isInitialized = false

  constructor(options: { model?: CoreMLModelType } = {}) {
    this.modelType = options.model ?? "parakeet"
  }

  /**
   * Check if CoreML is available (macOS only)
   */
  isAvailable(): boolean {
    return process.platform === "darwin"
  }

  /**
   * Initialize the appropriate engine
   */
  async initialize(language?: string): Promise<void> {
    if (this.isInitialized) {
      return
    }

    if (!this.isAvailable()) {
      throw new Error("CoreML backend is only available on macOS")
    }

    if (this.modelType === "parakeet") {
      const { ParakeetAsrEngine } = await import("parakeet-coreml")
      this.parakeetEngine = new ParakeetAsrEngine()
      await this.parakeetEngine.initialize()
    } else {
      const { WhisperAsrEngine, getModelPath } = await import("whisper-coreml")
      this.whisperEngine = new WhisperAsrEngine({
        modelPath: getModelPath(),
        language: language ?? "auto"
      })
      await this.whisperEngine.initialize()
    }

    this.isInitialized = true
  }

  /**
   * Transcribe an audio file
   */
  async transcribe(audioPath: string, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
    await this.initialize(options.language)

    const startTime = performance.now()

    // Load and decode audio
    const { samples, durationSeconds } = await this.loadAudio(audioPath)

    let text: string
    let segments: TranscriptionSegment[]
    let detectedLanguage = options.language ?? "auto"

    if (this.modelType === "parakeet" && this.parakeetEngine) {
      const result = await this.parakeetEngine.transcribe(samples, {
        sampleRate: 16000
      })

      text = result.text
      segments = result.segments.map((seg) => ({
        text: seg.text,
        startSeconds: seg.startTime,
        endSeconds: seg.endTime
      }))
    } else if (this.whisperEngine) {
      const result = await this.whisperEngine.transcribe(samples, 16000)

      text = result.text
      detectedLanguage = result.language
      segments = result.segments.map((seg) => ({
        text: seg.text,
        startSeconds: seg.startMs / 1000,
        endSeconds: seg.endMs / 1000,
        confidence: seg.confidence
      }))
    } else {
      throw new Error("No engine initialized")
    }

    const backendType = this.modelType === "parakeet" ? BACKEND_TYPES.parakeet : BACKEND_TYPES.whisper

    return {
      text,
      segments,
      durationSeconds,
      processingTimeSeconds: (performance.now() - startTime) / 1000,
      language: detectedLanguage,
      backend: backendType
    }
  }

  /**
   * Load audio from file
   */
  private async loadAudio(audioPath: string): Promise<{
    samples: Float32Array
    durationSeconds: number
  }> {
    if (!isFFmpegAvailable()) {
      throw new Error(
        "FFmpeg is required to decode audio files. " +
          "The @cuttledoc/ffmpeg package should be installed automatically."
      )
    }

    // Decode to 16kHz mono with speech optimization
    const audio = await decodeAudio(audioPath, {
      sampleRate: 16000,
      channels: 1,
      speechOptimize: true
    })

    // Normalize audio levels
    const samples = normalizeAudio(audio.samples)

    return {
      samples,
      durationSeconds: audio.durationSeconds
    }
  }

  /**
   * Get the current model type
   */
  getModelType(): CoreMLModelType {
    return this.modelType
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.parakeetEngine) {
      this.parakeetEngine.cleanup()
      this.parakeetEngine = null
    }
    if (this.whisperEngine) {
      this.whisperEngine.cleanup()
      this.whisperEngine = null
    }
    this.isInitialized = false
  }
}
