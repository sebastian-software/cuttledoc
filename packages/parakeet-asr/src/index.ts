/**
 * @cuttledoc/parakeet-asr
 *
 * Parakeet TDT ASR for Apple Silicon with CoreML/ANE acceleration.
 */

import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"

const require = createRequire(import.meta.url)

/**
 * Native addon interface
 */
interface NativeAddon {
  initialize(modelDir: string): boolean
  isInitialized(): boolean
  transcribe(samples: Float32Array, sampleRate?: number): string
  transcribeFile(filePath: string): string
  cleanup(): void
  getVersion(): { addon: string; model: string; coreml: string }
}

/**
 * Load the native addon
 */
function loadAddon(): NativeAddon {
  if (process.platform !== "darwin") {
    throw new Error("@cuttledoc/parakeet-asr is only supported on macOS")
  }

  try {
    const bindings = require("bindings")
    return bindings("coreml_asr") as NativeAddon
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load Parakeet ASR native addon: ${message}`)
  }
}

let addon: NativeAddon | null = null

function getAddon(): NativeAddon {
  if (addon === null) {
    addon = loadAddon()
  }
  return addon
}

/**
 * Transcription result
 */
export interface TranscriptionResult {
  text: string
  durationMs: number
}

/**
 * ASR Engine options
 */
export interface AsrEngineOptions {
  modelDir: string
}

/**
 * Parakeet ASR Engine with CoreML/ANE acceleration
 */
export class ParakeetAsrEngine {
  private readonly modelDir: string
  private initialized = false

  constructor(options: AsrEngineOptions) {
    this.modelDir = resolve(options.modelDir)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    if (!existsSync(this.modelDir)) {
      throw new Error(`Model directory not found: ${this.modelDir}`)
    }

    const alternativeEncoders = ["ParakeetEncoder_15s.mlmodelc", "Encoder.mlmodelc"]
    const alternativeDecoders = ["ParakeetDecoder.mlmodelc", "Decoder.mlmodelc"]

    const hasEncoder = alternativeEncoders.some((m) => existsSync(join(this.modelDir, m)))
    const hasDecoder = alternativeDecoders.some((m) => existsSync(join(this.modelDir, m)))
    const hasJoint = existsSync(join(this.modelDir, "JointDecision.mlmodelc"))

    if (!hasEncoder || !hasDecoder || !hasJoint) {
      throw new Error(
        `Missing required CoreML models in ${this.modelDir}. ` +
          `Expected: Encoder, Decoder, and JointDecision .mlmodelc directories`
      )
    }

    const hasVocab = existsSync(join(this.modelDir, "vocab.txt")) || existsSync(join(this.modelDir, "tokens.txt"))
    if (!hasVocab) {
      throw new Error(`Missing vocabulary file (vocab.txt or tokens.txt) in ${this.modelDir}`)
    }

    const nativeAddon = getAddon()
    const success = nativeAddon.initialize(this.modelDir)

    if (!success) {
      throw new Error("Failed to initialize Parakeet ASR engine")
    }

    this.initialized = true
  }

  isReady(): boolean {
    if (!this.initialized) return false
    return getAddon().isInitialized()
  }

  async transcribe(samples: Float32Array, sampleRate = 16000): Promise<TranscriptionResult> {
    if (!this.initialized) {
      throw new Error("ASR engine not initialized. Call initialize() first.")
    }

    const startTime = performance.now()
    const text = getAddon().transcribe(samples, sampleRate)
    const durationMs = performance.now() - startTime

    return { text, durationMs }
  }

  async transcribeFile(filePath: string): Promise<TranscriptionResult> {
    if (!this.initialized) {
      throw new Error("ASR engine not initialized. Call initialize() first.")
    }

    const startTime = performance.now()
    const text = getAddon().transcribeFile(resolve(filePath))
    const durationMs = performance.now() - startTime

    return { text, durationMs }
  }

  cleanup(): void {
    if (this.initialized) {
      getAddon().cleanup()
      this.initialized = false
    }
  }

  getVersion(): { addon: string; model: string; coreml: string } {
    return getAddon().getVersion()
  }
}

// Legacy alias for backwards compatibility
export { ParakeetAsrEngine as CoreMLAsrEngine }

export function isAvailable(): boolean {
  return process.platform === "darwin"
}
