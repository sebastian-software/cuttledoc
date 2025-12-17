import { join } from "node:path"

import {
  BACKEND_TYPES,
  type Backend,
  type TranscribeOptions,
  type TranscriptionResult,
  type TranscriptionSegment
} from "../../types.js"
import { isFFmpegAvailable, preprocessAudio } from "../../utils/audio.js"

import {
  SHERPA_MODELS,
  type SherpaModelInfo,
  type SherpaModelType,
  type SherpaModule,
  type SherpaOfflineRecognizer,
  type SherpaRecognizerConfig
} from "./types.js"

/**
 * Get the models directory path
 */
function getModelsDir(): string {
  // Default to ./models in the package root
  return process.env["LOCAL_TRANSCRIBE_MODELS_DIR"] ?? join(process.cwd(), "models")
}

/**
 * Load the sherpa-onnx module
 */
function loadSherpaModule(): SherpaModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("sherpa-onnx-node") as SherpaModule
  } catch {
    throw new Error("sherpa-onnx-node is not installed. Run: npm install sherpa-onnx-node")
  }
}

/**
 * Build recognizer config for a model
 */
function buildConfig(modelInfo: SherpaModelInfo, modelDir: string, numThreads: number): SherpaRecognizerConfig {
  const basePath = join(modelDir, modelInfo.folderName)

  const baseConfig: SherpaRecognizerConfig = {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80
    },
    modelConfig: {
      tokens: join(basePath, modelInfo.files.tokens),
      numThreads,
      provider: "cpu",
      debug: 0
    }
  }

  if (modelInfo.type === "transducer" && modelInfo.files.joiner !== undefined) {
    baseConfig.modelConfig.transducer = {
      encoder: join(basePath, modelInfo.files.encoder),
      decoder: join(basePath, modelInfo.files.decoder),
      joiner: join(basePath, modelInfo.files.joiner)
    }
    if (modelInfo.modelType !== undefined) {
      baseConfig.modelConfig.modelType = modelInfo.modelType
    }
  } else if (modelInfo.type === "whisper") {
    baseConfig.modelConfig.whisper = {
      encoder: join(basePath, modelInfo.files.encoder),
      decoder: join(basePath, modelInfo.files.decoder)
    }
  }

  return baseConfig
}

/**
 * Sherpa-ONNX backend for cross-platform speech recognition
 *
 * Supports multiple models:
 * - Parakeet TDT v3: Fast, 25 EU languages
 * - Whisper: 99 languages, various sizes
 */
export class SherpaBackend implements Backend {
  private sherpa: SherpaModule | null = null
  private recognizer: SherpaOfflineRecognizer | null = null
  private modelType: SherpaModelType
  private numThreads: number
  private isInitialized = false

  constructor(options: { model?: SherpaModelType; numThreads?: number } = {}) {
    this.modelType = options.model ?? "parakeet-tdt-0.6b-v3"
    this.numThreads = options.numThreads ?? 4
  }

  /**
   * Check if sherpa-onnx is available
   */
  isAvailable(): boolean {
    try {
      loadSherpaModule()
      return true
    } catch {
      return false
    }
  }

  /**
   * Initialize the recognizer with the configured model
   */
  initialize(): Promise<void> {
    if (this.isInitialized) {
      return Promise.resolve()
    }

    this.sherpa = loadSherpaModule()

    const modelInfo = SHERPA_MODELS[this.modelType]

    const modelsDir = getModelsDir()
    const config = buildConfig(modelInfo, modelsDir, this.numThreads)

    try {
      this.recognizer = new this.sherpa.OfflineRecognizer(config)
      this.isInitialized = true
      return Promise.resolve()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return Promise.reject(
        new Error(
          `Failed to initialize recognizer for model "${this.modelType}". ` +
            `Make sure the model is downloaded to ${modelsDir}. ` +
            `Error: ${errorMessage}`
        )
      )
    }
  }

  /**
   * Transcribe an audio file
   *
   * Supports any audio format when @mmomtchev/ffmpeg is installed.
   * Falls back to WAV-only support without ffmpeg.
   */
  async transcribe(audioPath: string, _options: TranscribeOptions = {}): Promise<TranscriptionResult> {
    if (!this.isInitialized || this.sherpa === null || this.recognizer === null) {
      await this.initialize()
    }

    // TypeScript narrowing doesn't persist after await, so we need to check again
    if (this.sherpa === null || this.recognizer === null) {
      throw new Error("Failed to initialize recognizer")
    }

    const startTime = performance.now()

    // Determine if we need to preprocess the audio
    const isWavFile = audioPath.toLowerCase().endsWith(".wav")
    let samples: Float32Array
    let sampleRate: number
    let durationSeconds: number

    if (isWavFile) {
      // Fast path: Use sherpa's native WAV reader
      const wave = this.sherpa.readWave(audioPath)
      samples = wave.samples
      sampleRate = wave.sampleRate
      durationSeconds = samples.length / sampleRate
    } else if (isFFmpegAvailable()) {
      // Use ffmpeg for other formats
      const audio = await preprocessAudio(audioPath)
      samples = audio.samples
      sampleRate = audio.sampleRate
      durationSeconds = audio.durationSeconds
    } else {
      throw new Error(
        `Unsupported audio format: ${audioPath}. ` +
          "Install @mmomtchev/ffmpeg for mp3, m4a, and other formats, " +
          "or convert to WAV (16kHz mono)."
      )
    }

    // Create stream and feed audio
    const stream = this.recognizer.createStream()
    stream.acceptWaveform({
      sampleRate,
      samples
    })

    // Decode
    this.recognizer.decode(stream)
    const result = this.recognizer.getResult(stream)

    // Build segments from timestamps if available
    const segments: TranscriptionSegment[] = []
    if (result.tokens !== undefined && result.timestamps !== undefined && result.tokens.length > 0) {
      // Group tokens into segments (simplified - join all tokens)
      segments.push({
        text: result.text,
        startSeconds: result.timestamps[0] ?? 0,
        endSeconds: result.timestamps[result.timestamps.length - 1] ?? durationSeconds
      })
    }

    return {
      text: result.text,
      segments,
      durationSeconds,
      processingTimeSeconds: (performance.now() - startTime) / 1000,
      language: result.lang ?? "auto",
      backend: BACKEND_TYPES.parakeet // Use parakeet as the backend type for sherpa
    }
  }

  /**
   * Get the current model type
   */
  getModelType(): SherpaModelType {
    return this.modelType
  }

  /**
   * Clean up resources
   */
  dispose(): Promise<void> {
    this.recognizer = null
    this.sherpa = null
    this.isInitialized = false
    return Promise.resolve()
  }
}

// Re-export types
export type { SherpaModelInfo, SherpaModelType, SherpaModule, SherpaRecognizerConfig } from "./types.js"
export { SHERPA_MODEL_TYPES, SHERPA_MODELS } from "./types.js"
