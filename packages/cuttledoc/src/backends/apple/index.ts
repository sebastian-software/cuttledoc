import { existsSync } from "node:fs"
import { platform } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  BACKEND_TYPES,
  type Backend,
  type TranscribeOptions,
  type TranscriptionResult,
  type TranscriptionSegment
} from "../../types.js"

import { getSpeechClient, type ServerResponse } from "./client.js"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

/** Path to the Cuttledoc.app bundle */
const APP_BUNDLE_PATH = join(__dirname, "swift", "Cuttledoc.app")

/**
 * Apple Speech Framework backend for macOS
 *
 * Uses a Swift-based Unix socket server for on-device transcription.
 * Requires macOS 12.0+ and speech recognition permissions.
 *
 * The server runs as a signed macOS app to properly handle TCC permissions.
 */
export class AppleBackend implements Backend {
  private readonly socketPath: string

  constructor(options: { socketPath?: string } = {}) {
    this.socketPath = options.socketPath ?? "/tmp/cuttledoc-speech.sock"
  }

  /**
   * Check if Apple Speech is available on this system
   */
  isAvailable(): boolean {
    // Only available on macOS
    if (platform() !== "darwin") {
      return false
    }

    // Check if the app bundle exists
    return existsSync(APP_BUNDLE_PATH)
  }

  /**
   * Check if the server is currently running
   */
  async isServerRunning(): Promise<boolean> {
    const client = getSpeechClient(this.socketPath)
    return client.isServerRunning()
  }

  /**
   * Start the transcription server if not already running
   */
  async ensureServerRunning(): Promise<void> {
    const client = getSpeechClient(this.socketPath)
    await client.ensureServerRunning()
  }

  /**
   * Transcribe an audio file using Apple Speech Framework
   */
  async transcribe(audioPath: string, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
    const client = getSpeechClient(this.socketPath)
    const startTime = performance.now()
    const language = options.language ?? "en-US"

    // Ensure server is running
    await client.ensureServerRunning()

    // Call transcription via socket
    const result: ServerResponse = await client.transcribe(audioPath, language)

    if (!result.success) {
      throw new Error(result.error ?? "Transcription failed")
    }

    // Convert segments to our format
    const segments: TranscriptionSegment[] = (result.segments ?? []).map((seg) => ({
      text: seg.text,
      startSeconds: seg.startSeconds,
      endSeconds: seg.endSeconds,
      confidence: seg.confidence
    }))

    return {
      text: result.text ?? "",
      segments,
      durationSeconds: result.durationSeconds ?? 0,
      processingTimeSeconds: (performance.now() - startTime) / 1000,
      language,
      backend: BACKEND_TYPES.apple
    }
  }

  /**
   * Clean up resources - shuts down the server
   */
  async dispose(): Promise<void> {
    const client = getSpeechClient(this.socketPath)
    if (await client.isServerRunning()) {
      await client.shutdown()
    }
  }
}

// Re-export client types
export { getSpeechClient, type ServerResponse } from "./client.js"
