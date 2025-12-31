/**
 * Audio decoding utilities using FFmpeg CLI
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
  /** Normalize audio to target peak level (default: 0.9) */
  normalize?: boolean
  /** Target peak level for normalization (default: 0.9) */
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
 * Decode an audio file to Float32 samples.
 *
 * Supports any format that FFmpeg can decode: MP3, OGG, M4A, FLAC, WAV, etc.
 *
 * @param inputPath - Path to the audio file
 * @param options - Decoding options
 * @returns Decoded audio data with Float32 samples
 *
 * @example
 * ```typescript
 * import { decodeAudio } from '@cuttledoc/ffmpeg'
 *
 * // Decode to 16kHz mono (ideal for speech recognition)
 * const audio = await decodeAudio('speech.ogg', {
 *   sampleRate: 16000,
 *   channels: 1
 * })
 *
 * console.log(`Duration: ${audio.durationSeconds}s`)
 * console.log(`Samples: ${audio.samples.length}`)
 * ```
 */
export async function decodeAudio(inputPath: string, options: DecodeOptions = {}): Promise<AudioData> {
  if (!existsSync(inputPath)) {
    throw new Error(`Audio file not found: ${inputPath}`)
  }

  const sampleRate = options.sampleRate ?? 16000
  const channels = options.channels ?? 1
  const normalize = options.normalize ?? true
  const targetPeak = options.targetPeak ?? 0.9

  // Build FFmpeg arguments
  const args = [
    "-i",
    inputPath,
    "-ar",
    String(sampleRate),
    "-ac",
    String(channels),
    "-f",
    "f32le", // 32-bit float, little-endian
    "-acodec",
    "pcm_f32le",
    "-" // Output to stdout
  ]

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
    let samples = new Float32Array(arrayBuffer)

    // Normalize if requested
    if (normalize) {
      samples = normalizeAudio(samples, targetPeak)
    }

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

/**
 * Normalize audio samples to a target peak level.
 *
 * @param samples - Float32 audio samples
 * @param targetPeak - Target peak level (default: 0.9)
 * @returns Normalized samples
 */
function normalizeAudio(samples: Float32Array<ArrayBuffer>, targetPeak = 0.9): Float32Array<ArrayBuffer> {
  // Find current peak
  let currentPeak = 0
  for (const sample of samples) {
    const abs = Math.abs(sample)
    if (abs > currentPeak) {
      currentPeak = abs
    }
  }

  // If audio is already loud enough or silent, don't modify
  if (currentPeak >= targetPeak * 0.5 || currentPeak === 0) {
    return samples
  }

  // Apply gain to reach target peak
  const gain = targetPeak / currentPeak
  const buffer = new ArrayBuffer(samples.length * 4)
  const normalized = new Float32Array(buffer)
  let idx = 0
  for (const sample of samples) {
    normalized[idx++] = sample * gain
  }

  return normalized
}
