/**
 * Audio decoding utilities using FFmpeg CLI
 *
 * Includes speech-optimized preprocessing:
 * - Bandpass filter (80Hz - 12kHz) to remove rumble and hiss
 * - EBU R128 loudness normalization for consistent levels
 */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, open, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ffmpegPath } from "./binary.js"

const STDERR_TAIL_LENGTH = 64 * 1024

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
  /** Audio samples in range [-1, 1], interleaved by channel for multi-channel audio */
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

/** @internal Build the FFmpeg arguments used for PCM decoding. */
export function buildDecodeArgs(
  inputPath: string,
  sampleRate: number,
  channels: number,
  speechOptimize: boolean
): string[] {
  const args = ["-hide_banner", "-nostdin", "-i", inputPath]

  if (speechOptimize) {
    args.push("-af", buildSpeechFilters())
  }

  args.push("-ar", String(sampleRate), "-ac", String(channels), "-f", "f32le", "-acodec", "pcm_f32le", "-")

  return args
}

/** @internal Calculate duration from interleaved PCM sample values. */
export function calculateDurationSeconds(sampleCount: number, sampleRate: number, channels: number): number {
  return sampleCount / (sampleRate * channels)
}

/**
 * Stream FFmpeg stdout directly to a file descriptor while retaining only a
 * bounded stderr tail for useful failure messages.
 */
function runFFmpeg(executable: string, args: string[], outputFileDescriptor: number): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    let stderrTail = ""
    const child = spawn(executable, args, {
      stdio: ["ignore", outputFileDescriptor, "pipe"]
    })

    child.stderr?.setEncoding("utf8")
    child.stderr?.on("data", (chunk: string) => {
      stderrTail = `${stderrTail}${chunk}`.slice(-STDERR_TAIL_LENGTH)
    })

    child.once("error", rejectPromise)
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      const reason = signal === null ? `exit code ${String(code)}` : `signal ${signal}`
      const details = stderrTail.trim()
      rejectPromise(new Error(`FFmpeg exited with ${reason}${details ? `: ${details}` : ""}`))
    })
  })
}

async function decodeToFile(executable: string, args: string[], outputPath: string): Promise<void> {
  const outputFile = await open(outputPath, "w")
  try {
    await runFFmpeg(executable, args, outputFile.fd)
  } finally {
    await outputFile.close()
  }
}

/** @internal Convert PCM bytes without exposing unrelated Buffer pool storage. */
export function toFloat32Samples(pcm: Buffer): Float32Array {
  if (pcm.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`FFmpeg returned ${String(pcm.byteLength)} bytes of incomplete f32le audio`)
  }

  const hasExactBackingBuffer = pcm.byteOffset === 0 && pcm.byteLength === pcm.buffer.byteLength
  if (hasExactBackingBuffer) {
    return new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / Float32Array.BYTES_PER_ELEMENT)
  }

  // Small Buffers can be views into Node's shared allocation pool. Copy those
  // views so samples.buffer contains exactly the decoded audio bytes.
  const alignedBytes = new Uint8Array(pcm.byteLength)
  alignedBytes.set(pcm)
  return new Float32Array(alignedBytes.buffer)
}

type DirectoryRemover = (directory: string, options: { recursive: true; force: true }) => Promise<void>

/** @internal Remove temporary data without replacing the decode outcome. */
export async function cleanupTemporaryDirectory(
  directory: string,
  removeDirectory: DirectoryRemover = rm
): Promise<void> {
  try {
    await removeDirectory(directory, { recursive: true, force: true })
  } catch {
    // Cleanup is best-effort. It must not replace a useful FFmpeg error or
    // discard successfully decoded audio.
  }
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
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Kept for backwards compatibility.
  const legacyNormalize = options.normalize
  const speechOptimize = options.speechOptimize ?? legacyNormalize ?? true

  const args = buildDecodeArgs(inputPath, sampleRate, channels, speechOptimize)

  try {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "cuttledoc-ffmpeg-"))
    try {
      const outputPath = join(temporaryDirectory, "decoded.f32le")
      await decodeToFile(ffmpegPath(), args, outputPath)

      const samples = toFloat32Samples(await readFile(outputPath))
      const durationSeconds = calculateDurationSeconds(samples.length, sampleRate, channels)

      return {
        samples,
        sampleRate,
        channels,
        durationSeconds
      }
    } finally {
      await cleanupTemporaryDirectory(temporaryDirectory)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to decode audio: ${message}`, { cause: error })
  }
}
