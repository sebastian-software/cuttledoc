/**
 * Audio decoding utilities using FFmpeg CLI
 *
 * Includes speech-optimized preprocessing:
 * - Bandpass filter (80Hz - 12kHz) to remove rumble and hiss
 * - EBU R128 loudness normalization for consistent levels
 */

import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { promisify } from "node:util"
import { ffmpegPath } from "./binary.js"

const execFileAsync = promisify(execFile)

/**
 * Options for audio decoding
 */
export interface DecodeOptions {
  /** Target sample rate (default: 16000) */
  sampleRate?: number
  /** Number of channels (default: 1 for mono) */
  channels?: number
  /**
   * Apply speech-optimized preprocessing (default: true)
   * - Bandpass filter: 80Hz - 12kHz (removes rumble and hiss)
   * - Loudness normalization: EBU R128 standard
   */
  speechOptimize?: boolean
  /**
   * @deprecated Use speechOptimize instead. Peak normalization is replaced by EBU R128 loudnorm.
   */
  normalize?: boolean
  /**
   * @deprecated No longer used. EBU R128 loudnorm handles normalization.
   */
  targetPeak?: number
}

/**
 * Decoded audio data
 */
export interface AudioData {
  /** Audio samples as Float32Array in range [-1, 1] */
  samples: Float32Array
  /** Sample rate in Hz */
  sampleRate: number
  /** Number of channels */
  channels: number
  /** Duration in seconds */
  durationSeconds: number
}

/**
 * Build the audio filter chain for speech preprocessing
 */
function buildSpeechFilters(): string {
  // Bandpass filter: Keep frequencies relevant for speech (80Hz - 12kHz)
  // - highpass=f=80: Removes low-frequency rumble (HVAC, traffic, mic handling)
  // - lowpass=f=12000: Removes high-frequency hiss and noise
  const bandpass = "highpass=f=80,lowpass=f=12000"

  // EBU R128 loudness normalization
  // - I=-16: Target integrated loudness (standard for speech/podcasts)
  // - LRA=11: Loudness range (how much dynamic variation to allow)
  // - TP=-1.5: True peak limit (prevents clipping)
  const loudnorm = "loudnorm=I=-16:LRA=11:TP=-1.5"

  return `${bandpass},${loudnorm}`
}

/**
 * Decode an audio file to Float32 samples.
 *
 * Supports any format that FFmpeg can decode: MP3, OGG, M4A, FLAC, WAV, etc.
 *
 * By default, applies speech-optimized preprocessing:
 * - Bandpass filter (80Hz - 12kHz) to remove rumble and hiss
 * - EBU R128 loudness normalization for consistent levels
 *
 * @param inputPath - Path to the audio file
 * @param options - Decoding options
 * @returns Decoded audio data with Float32 samples
 *
 * @example
 * ```typescript
 * import { decodeAudio } from '@cuttledoc/ffmpeg'
 *
 * // Decode with speech optimization (default)
 * const audio = await decodeAudio('speech.ogg')
 *
 * // Decode without preprocessing (raw conversion)
 * const raw = await decodeAudio('audio.mp3', { speechOptimize: false })
 * ```
 */
export async function decodeAudio(inputPath: string, options: DecodeOptions = {}): Promise<AudioData> {
  if (!existsSync(inputPath)) {
    throw new Error(`Audio file not found: ${inputPath}`)
  }

  const sampleRate = options.sampleRate ?? 16000
  const channels = options.channels ?? 1

  // Support legacy 'normalize' option, default to speech optimization
  const speechOptimize = options.speechOptimize ?? options.normalize ?? true

  // Build FFmpeg arguments
  const args = [
    "-hide_banner", // Suppress FFmpeg banner
    "-i",
    inputPath
  ]

  // Add speech preprocessing filters if enabled
  if (speechOptimize) {
    args.push("-af", buildSpeechFilters())
  }

  // Output format
  args.push(
    "-ar",
    String(sampleRate),
    "-ac",
    String(channels),
    "-f",
    "f32le", // 32-bit float, little-endian
    "-acodec",
    "pcm_f32le",
    "-" // Output to stdout
  )

  try {
    const { stdout } = await execFileAsync(ffmpegPath(), args, {
      encoding: "buffer",
      maxBuffer: 500 * 1024 * 1024 // 500MB max
    })

    // Convert Buffer to Float32Array
    // Create a copy to ensure we have a proper ArrayBuffer
    const arrayBuffer = new ArrayBuffer(stdout.byteLength)
    const view = new Uint8Array(arrayBuffer)
    view.set(stdout)
    const samples = new Float32Array(arrayBuffer)

    const durationSeconds = samples.length / sampleRate

    return {
      samples,
      sampleRate,
      channels,
      durationSeconds
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to decode audio: ${message}`)
  }
}
