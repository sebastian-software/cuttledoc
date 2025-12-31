/**
 * Audio preprocessing utilities using system ffmpeg
 *
 * Converts various audio formats to 16kHz mono Float32 samples
 * suitable for speech recognition models.
 *
 * Uses the system-installed ffmpeg command-line tool for reliable
 * cross-platform audio conversion.
 */

import { existsSync, readFileSync, unlinkSync, mkdtempSync } from "node:fs"
import { execSync, spawnSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"

/**
 * Audio samples in the format expected by speech recognition models
 */
export interface AudioSamples {
  /** Float32 samples in range [-1, 1] */
  samples: Float32Array
  /** Sample rate (always 16000 for our use case) */
  sampleRate: number
  /** Duration in seconds */
  durationSeconds: number
}

/**
 * Normalize audio samples to a target peak level.
 *
 * Some audio sources (like FLEURS dataset) have very low volume levels
 * which can cause recognition issues with some models like Parakeet.
 *
 * @param samples - Float32 audio samples
 * @param targetPeak - Target peak level (default: 0.9)
 * @returns Normalized samples (may be same array if already loud enough)
 */
export function normalizeAudio(samples: Float32Array, targetPeak = 0.9): Float32Array {
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
  const normalized = new Float32Array(samples.length)
  let idx = 0
  for (const sample of samples) {
    normalized[idx++] = sample * gain
  }

  return normalized
}

/**
 * Options for audio preprocessing
 */
export interface AudioPreprocessOptions {
  /** Target sample rate (default: 16000) */
  sampleRate?: number
  /** Target channels (default: 1 for mono) */
  channels?: number
}

// Cache the ffmpeg availability check
let ffmpegAvailable: boolean | null = null

/**
 * Check if system ffmpeg is available
 */
export function isFFmpegAvailable(): boolean {
  if (ffmpegAvailable !== null) {
    return ffmpegAvailable
  }

  try {
    const result = spawnSync("ffmpeg", ["-version"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"]
    })
    ffmpegAvailable = result.status === 0
  } catch {
    ffmpegAvailable = false
  }

  return ffmpegAvailable
}

/**
 * Convert an audio file to 16kHz mono Float32 samples using system ffmpeg
 *
 * Supports any format that ffmpeg can decode (mp3, m4a, wav, flac, ogg, etc.)
 *
 * @param audioPath - Path to the audio file
 * @param options - Preprocessing options
 * @returns Promise resolving to audio samples
 */
export async function preprocessAudio(audioPath: string, options: AudioPreprocessOptions = {}): Promise<AudioSamples> {
  const targetSampleRate = options.sampleRate ?? 16000
  const targetChannels = options.channels ?? 1

  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`)
  }

  if (!isFFmpegAvailable()) {
    throw new Error("ffmpeg is not installed. Please install ffmpeg to process non-WAV audio files.")
  }

  // Create temp file for raw PCM output
  const tempDir = mkdtempSync(join(tmpdir(), "cuttledoc-"))
  const tempFile = join(tempDir, "audio.raw")

  try {
    // Convert to raw PCM float32 little-endian mono
    execSync(
      `ffmpeg -i "${audioPath}" -ar ${targetSampleRate} -ac ${targetChannels} -f f32le -acodec pcm_f32le -y "${tempFile}"`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 60000 // 1 minute timeout
      }
    )

    // Read the raw PCM data
    const buffer = readFileSync(tempFile)
    const samples = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)

    const durationSeconds = samples.length / targetSampleRate

    return {
      samples,
      sampleRate: targetSampleRate,
      durationSeconds
    }
  } finally {
    // Cleanup temp files
    try {
      if (existsSync(tempFile)) {
        unlinkSync(tempFile)
      }
      if (existsSync(tempDir)) {
        unlinkSync(tempDir)
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Stream audio samples from a file
 *
 * For system ffmpeg, this just reads the entire file at once.
 * True streaming would require more complex piping.
 *
 * @param audioPath - Path to the audio file
 * @param options - Preprocessing options
 */
export async function* streamAudioSamples(
  audioPath: string,
  options: AudioPreprocessOptions = {}
): AsyncGenerator<Float32Array, void, unknown> {
  // For simplicity, just load all samples at once
  const result = await preprocessAudio(audioPath, options)
  yield result.samples
}

/**
 * Get audio file duration
 *
 * Uses ffprobe for fast duration lookup without full decode.
 *
 * @param audioPath - Path to the audio file
 * @returns Duration in seconds
 */
export async function getAudioDuration(audioPath: string): Promise<number> {
  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`)
  }

  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
      {
        encoding: "utf-8",
        timeout: 10000
      }
    )
    const duration = parseFloat(result.trim())
    if (isNaN(duration)) {
      throw new Error("Could not parse duration")
    }
    return duration
  } catch {
    // Fallback: decode and measure
    const result = await preprocessAudio(audioPath)
    return result.durationSeconds
  }
}

/**
 * Check if a file is a supported audio format
 *
 * @param audioPath - Path to the audio file
 * @returns True if the file can be decoded
 */
export async function isAudioSupported(audioPath: string): Promise<boolean> {
  if (!existsSync(audioPath)) {
    return false
  }

  if (!isFFmpegAvailable()) {
    // Without ffmpeg, only WAV is supported
    return audioPath.toLowerCase().endsWith(".wav")
  }

  try {
    // Use ffprobe to check if file has audio streams
    const result = spawnSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", audioPath],
      {
        encoding: "utf-8",
        timeout: 10000
      }
    )
    return result.status === 0 && result.stdout.includes("audio")
  } catch {
    return false
  }
}
