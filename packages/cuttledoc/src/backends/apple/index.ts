import {
  BACKEND_TYPES,
  type Backend,
  type TranscribeOptions,
  type TranscriptionResult,
  type TranscriptionSegment
} from "../../types.js"

import { getNativeModule, isNativeModuleAvailable } from "./native.js"
import { type AuthorizationStatus } from "./types.js"

/**
 * Apple Speech Framework backend for macOS
 *
 * Uses the native SFSpeechRecognizer for on-device transcription.
 * Requires macOS 12.0+ and speech recognition permissions.
 */
export class AppleBackend implements Backend {
  private readonly onDeviceOnly: boolean

  constructor(options: { onDeviceOnly?: boolean } = {}) {
    this.onDeviceOnly = options.onDeviceOnly ?? true
  }

  /**
   * Check if Apple Speech is available on this system
   */
  isAvailable(): boolean {
    if (!isNativeModuleAvailable()) {
      return false
    }

    try {
      const native = getNativeModule()
      return native.isAvailable()
    } catch {
      return false
    }
  }

  /**
   * Check if on-device recognition is supported for a language
   */
  supportsOnDevice(language?: string): boolean {
    if (!isNativeModuleAvailable()) {
      return false
    }

    try {
      const native = getNativeModule()
      return native.supportsOnDevice(language)
    } catch {
      return false
    }
  }

  /**
   * Get list of supported locales
   */
  getSupportedLocales(): readonly string[] {
    if (!isNativeModuleAvailable()) {
      return []
    }

    try {
      const native = getNativeModule()
      return native.getSupportedLocales()
    } catch {
      return []
    }
  }

  /**
   * Request speech recognition authorization
   */
  async requestAuthorization(): Promise<AuthorizationStatus> {
    const native = getNativeModule()
    return native.requestAuthorization()
  }

  /**
   * Transcribe an audio file using Apple Speech Framework
   */
  async transcribe(audioPath: string, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
    const native = getNativeModule()
    const startTime = performance.now()
    const language = options.language ?? "en-US"

    // Call native transcription
    const result = await native.transcribe(audioPath, {
      language,
      onDeviceOnly: this.onDeviceOnly
    })

    // Convert segments to our format
    const segments: TranscriptionSegment[] = result.segments.map((seg) => ({
      text: seg.text,
      startSeconds: seg.startSeconds,
      endSeconds: seg.endSeconds,
      confidence: seg.confidence
    }))

    return {
      text: result.text,
      segments,
      durationSeconds: result.durationSeconds,
      processingTimeSeconds: (performance.now() - startTime) / 1000,
      language,
      backend: BACKEND_TYPES.apple
    }
  }

  /**
   * Clean up resources
   */
  dispose(): Promise<void> {
    // No cleanup needed for Apple Speech
    return Promise.resolve()
  }
}

// Re-export types
export type {
  AppleNativeBindings,
  AppleNativeResult,
  AppleNativeSegment,
  AppleTranscribeOptions,
  AuthorizationStatus
} from "./types.js"
