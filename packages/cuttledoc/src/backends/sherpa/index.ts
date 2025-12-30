import { join } from "node:path"

import type { Vad, VadConfig } from "sherpa-onnx-node"

import {
  BACKEND_TYPES,
  type Backend,
  type TranscribeOptions,
  type TranscriptionResult,
  type TranscriptionSegment
} from "../../types.js"
import { isFFmpegAvailable, preprocessAudio } from "../../utils/audio.js"

import { getModelsDir, getSileroVadPath, isVadModelDownloaded } from "./download.js"
import {
  SHERPA_MODELS,
  type SherpaModelInfo,
  type SherpaModelType,
  type SherpaModule,
  type SherpaOfflineRecognizer,
  type SherpaRecognizerConfig
} from "./types.js"

/** Maximum audio duration in seconds before VAD chunking is required for Whisper */
const WHISPER_MAX_DURATION_SECONDS = 25

/** VAD configuration for Silero VAD */
interface VadInstance {
  vad: Vad
  config: VadConfig
}

/**
 * Load the sherpa-onnx module
 */
let sherpaModule: SherpaModule | null = null

async function loadSherpaModule(): Promise<SherpaModule> {
  if (sherpaModule) {
    return sherpaModule
  }
  try {
    // ESM import returns { default: module } structure
    const mod = await import("sherpa-onnx-node")
    sherpaModule = (mod.default ?? mod) as unknown as SherpaModule
    return sherpaModule
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`sherpa-onnx-node failed to load: ${msg}`)
  }
}

/**
 * Create VAD instance for speech segmentation
 */
async function createVadInstance(numThreads: number): Promise<VadInstance> {
  const vadPath = getSileroVadPath()

  if (!isVadModelDownloaded()) {
    throw new Error(
      `Silero VAD model not found at ${vadPath}. ` + "Run 'cuttledoc models download silero-vad' to download it."
    )
  }

  const sherpa = await loadSherpaModule()
  const VadClass = (sherpa as unknown as { Vad: typeof Vad }).Vad

  const config: VadConfig = {
    sileroVad: {
      model: vadPath,
      threshold: 0.5,
      minSilenceDuration: 0.5,
      minSpeechDuration: 0.25,
      maxSpeechDuration: 30, // Max segment length in seconds
      numThreads,
      sampleRate: 16000
    }
  }

  const vad = new VadClass(config, 60) // 60 second buffer

  return { vad, config }
}

/**
 * Build recognizer config for a model
 */
function buildConfig(
  modelInfo: SherpaModelInfo,
  modelDir: string,
  numThreads: number,
  language?: string
): SherpaRecognizerConfig {
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
      decoder: join(basePath, modelInfo.files.decoder),
      language,
      task: "transcribe"
    }
  }

  return baseConfig
}

/**
 * Sherpa-ONNX backend for cross-platform speech recognition
 *
 * Supports multiple models:
 * - Parakeet TDT v3: Fast, 25 languages
 * - Whisper large-v3: 99 languages, with VAD chunking for long audio
 */
export class SherpaBackend implements Backend {
  private sherpa: SherpaModule | null = null
  private recognizer: SherpaOfflineRecognizer | null = null
  private modelType: SherpaModelType
  private numThreads: number
  private isInitialized = false
  private currentLanguage: string | undefined
  private vadInstance: VadInstance | null = null

  constructor(options: { model?: SherpaModelType; numThreads?: number } = {}) {
    this.modelType = options.model ?? "parakeet-tdt-0.6b-v3"
    this.numThreads = options.numThreads ?? 4
  }

  /**
   * Check if sherpa-onnx is available
   */
  isAvailable(): boolean {
    // Can't check synchronously with dynamic import, assume available if module exists
    return true
  }

  /**
   * Initialize the recognizer with the configured model
   */
  async initialize(language?: string): Promise<void> {
    // Re-initialize if language changed (for Whisper)
    const needsReinit = this.currentLanguage !== language && this.isWhisperModel()

    if (this.isInitialized && !needsReinit) {
      return
    }

    this.sherpa = await loadSherpaModule()
    this.currentLanguage = language

    const modelInfo = SHERPA_MODELS[this.modelType]
    const modelsDir = getModelsDir()
    const config = buildConfig(modelInfo, modelsDir, this.numThreads, language)

    try {
      this.recognizer = new this.sherpa.OfflineRecognizer(config)
      this.isInitialized = true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Failed to initialize recognizer for model "${this.modelType}". ` +
          `Make sure the model is downloaded to ${modelsDir}. ` +
          `Error: ${errorMessage}`
      )
    }
  }

  /**
   * Check if current model is a Whisper model
   */
  private isWhisperModel(): boolean {
    return this.modelType.startsWith("whisper")
  }

  /**
   * Get or create VAD instance (lazy loaded)
   */
  private async getVadInstance(): Promise<VadInstance> {
    if (this.vadInstance === null) {
      this.vadInstance = await createVadInstance(this.numThreads)
    }
    return this.vadInstance
  }

  /**
   * Transcribe an audio file
   *
   * Supports any audio format when @mmomtchev/ffmpeg is installed.
   * Falls back to WAV-only support without ffmpeg.
   *
   * For Whisper models with audio > 25s, uses VAD chunking to handle
   * Whisper's 30-second context window limit.
   */
  async transcribe(audioPath: string, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
    // Initialize with language (important for Whisper)
    await this.initialize(options.language)

    // TypeScript narrowing doesn't persist after await, so we need to check again
    if (this.sherpa === null || this.recognizer === null) {
      throw new Error("Failed to initialize recognizer")
    }

    const startTime = performance.now()

    // Load audio samples
    const { samples, sampleRate, durationSeconds } = await this.loadAudio(audioPath)

    // Determine if we need VAD chunking (Whisper with long audio)
    const needsVadChunking = this.isWhisperModel() && durationSeconds > WHISPER_MAX_DURATION_SECONDS

    let fullText: string
    const segments: TranscriptionSegment[] = []

    if (needsVadChunking) {
      // Use VAD to chunk long audio for Whisper
      const result = await this.transcribeWithVad(samples, sampleRate, durationSeconds, options)
      fullText = result.text
      segments.push(...result.segments)
    } else {
      // Direct transcription for short audio or non-Whisper models
      const result = this.transcribeDirect(samples, sampleRate, durationSeconds)
      fullText = result.text
      segments.push(...result.segments)
    }

    // Determine the correct backend type based on model
    const backendType = this.isWhisperModel() ? BACKEND_TYPES.whisper : BACKEND_TYPES.parakeet

    return {
      text: fullText,
      segments,
      durationSeconds,
      processingTimeSeconds: (performance.now() - startTime) / 1000,
      language: options.language ?? "auto",
      backend: backendType
    }
  }

  /**
   * Load audio from file
   */
  private async loadAudio(audioPath: string): Promise<{
    samples: Float32Array
    sampleRate: number
    durationSeconds: number
  }> {
    if (this.sherpa === null) {
      throw new Error("Sherpa module not loaded")
    }

    const isWavFile = audioPath.toLowerCase().endsWith(".wav")

    if (isWavFile) {
      // Fast path: Use sherpa's native WAV reader
      const wave = this.sherpa.readWave(audioPath)
      return {
        samples: wave.samples,
        sampleRate: wave.sampleRate,
        durationSeconds: wave.samples.length / wave.sampleRate
      }
    } else if (isFFmpegAvailable()) {
      // Use ffmpeg for other formats
      const audio = await preprocessAudio(audioPath)
      return {
        samples: audio.samples,
        sampleRate: audio.sampleRate,
        durationSeconds: audio.durationSeconds
      }
    } else {
      throw new Error(
        `Unsupported audio format: ${audioPath}. ` +
          "Install @mmomtchev/ffmpeg for mp3, m4a, and other formats, " +
          "or convert to WAV (16kHz mono)."
      )
    }
  }

  /**
   * Direct transcription without chunking
   */
  private transcribeDirect(
    samples: Float32Array,
    sampleRate: number,
    durationSeconds: number
  ): { text: string; segments: TranscriptionSegment[] } {
    if (this.recognizer === null) {
      throw new Error("Recognizer not initialized")
    }

    const stream = this.recognizer.createStream()
    stream.acceptWaveform({ sampleRate, samples })
    this.recognizer.decode(stream)
    const result = this.recognizer.getResult(stream)

    const segments: TranscriptionSegment[] = []
    if (result.tokens !== undefined && result.timestamps !== undefined && result.tokens.length > 0) {
      segments.push({
        text: result.text,
        startSeconds: result.timestamps[0] ?? 0,
        endSeconds: result.timestamps[result.timestamps.length - 1] ?? durationSeconds
      })
    }

    return { text: result.text, segments }
  }

  /**
   * Transcribe long audio using VAD chunking
   *
   * Uses Silero VAD to detect speech segments, then transcribes each segment
   * with Whisper. This handles Whisper's 30-second context window limit.
   */
  private async transcribeWithVad(
    samples: Float32Array,
    sampleRate: number,
    _durationSeconds: number,
    _options: TranscribeOptions
  ): Promise<{ text: string; segments: TranscriptionSegment[] }> {
    if (this.recognizer === null) {
      throw new Error("Recognizer not initialized")
    }

    const { vad } = await this.getVadInstance()
    const segments: TranscriptionSegment[] = []
    const textParts: string[] = []

    // Reset VAD state
    vad.reset()

    // VAD window size (512 samples = ~32ms at 16kHz)
    const windowSize = 512

    // Process audio in chunks
    let offset = 0
    while (samples.length - offset > windowSize) {
      const chunk = samples.subarray(offset, offset + windowSize)
      vad.acceptWaveform(chunk)
      offset += windowSize

      // Process any detected speech segments
      while (!vad.isEmpty()) {
        const speechSegment = vad.front()
        vad.pop()

        // Convert samples list to Float32Array if needed
        const segmentSamples =
          speechSegment.samples instanceof Float32Array
            ? speechSegment.samples
            : new Float32Array(speechSegment.samples as number[])

        if (segmentSamples.length === 0) {
          continue
        }

        // Calculate timing from sample position
        const startSeconds = speechSegment.start / sampleRate
        const endSeconds = (speechSegment.start + segmentSamples.length) / sampleRate

        // Transcribe this speech segment
        const stream = this.recognizer.createStream()
        stream.acceptWaveform({
          sampleRate,
          samples: segmentSamples
        })
        this.recognizer.decode(stream)
        const result = this.recognizer.getResult(stream)

        if (result.text.trim().length > 0) {
          textParts.push(result.text.trim())
          segments.push({
            text: result.text.trim(),
            startSeconds,
            endSeconds
          })
        }
      }
    }

    // Accept any remaining samples
    if (samples.length - offset > 0) {
      vad.acceptWaveform(samples.subarray(offset))
    }

    // Flush any remaining audio
    vad.flush()

    // Process any remaining segments after flush
    while (!vad.isEmpty()) {
      const speechSegment = vad.front()
      vad.pop()

      const segmentSamples =
        speechSegment.samples instanceof Float32Array
          ? speechSegment.samples
          : new Float32Array(speechSegment.samples as number[])

      if (segmentSamples.length === 0) {
        continue
      }

      const startSeconds = speechSegment.start / sampleRate
      const endSeconds = (speechSegment.start + segmentSamples.length) / sampleRate

      const stream = this.recognizer.createStream()
      stream.acceptWaveform({
        sampleRate,
        samples: segmentSamples
      })
      this.recognizer.decode(stream)
      const result = this.recognizer.getResult(stream)

      if (result.text.trim().length > 0) {
        textParts.push(result.text.trim())
        segments.push({
          text: result.text.trim(),
          startSeconds,
          endSeconds
        })
      }
    }

    return {
      text: textParts.join(" "),
      segments
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
    this.vadInstance = null
    this.isInitialized = false
    this.currentLanguage = undefined
    return Promise.resolve()
  }
}

// Re-export types
export type { SherpaModelInfo, SherpaModelType, SherpaModule, SherpaRecognizerConfig } from "./types.js"
export { SHERPA_MODEL_TYPES, SHERPA_MODELS } from "./types.js"
