/**
 * Audio preprocessing utilities using native ffmpeg bindings
 *
 * Converts various audio formats to 16kHz mono Float32 samples
 * suitable for speech recognition models.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync } from "node:fs"

import type { AudioStreamDefinition } from "@mmomtchev/ffmpeg/stream"

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
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i])
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
  for (let i = 0; i < samples.length; i++) {
    normalized[i] = samples[i] * gain
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

// Lazy-loaded ffmpeg modules
let cachedFFmpeg: any = null
let cachedStream: any = null

/**
 * Check if ffmpeg bindings are available
 */
export function isFFmpegAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@mmomtchev/ffmpeg")
    return true
  } catch {
    return false
  }
}

/**
 * Load the ffmpeg modules
 */
function loadFFmpeg(): { ffmpeg: any; stream: any } {
  if (cachedFFmpeg === null || cachedStream === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cachedFFmpeg = require("@mmomtchev/ffmpeg")
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cachedStream = require("@mmomtchev/ffmpeg/stream")
    } catch {
      throw new Error("@mmomtchev/ffmpeg is not installed. Run: npm install @mmomtchev/ffmpeg")
    }
  }
  return { ffmpeg: cachedFFmpeg, stream: cachedStream }
}

/**
 * Convert an audio file to 16kHz mono Float32 samples
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

  const { ffmpeg, stream } = loadFFmpeg()

  return new Promise((resolve, reject) => {
    const chunks: Float32Array[] = []
    let totalSamples = 0

    // Create demuxer to read the input file
    const demuxer = new stream.Demuxer({ inputFile: audioPath })

    demuxer.on("error", (err: Error) => {
      reject(err)
    })

    demuxer.on("ready", () => {
      try {
        // Get the first audio stream
        const audioStream = demuxer.audio[0]
        if (audioStream === undefined) {
          reject(new Error("No audio stream found in file"))
          return
        }

        // Create audio decoder
        const decoder = new stream.AudioDecoder({ stream: audioStream.stream })
        const inputDef = decoder.definition()

        // Create output definition with proper types
        const outputDef: AudioStreamDefinition = {
          type: "Audio",
          bitRate: inputDef.bitRate,
          codec: inputDef.codec,
          sampleRate: targetSampleRate,
          sampleFormat: new ffmpeg.SampleFormat("flt"),
          channelLayout: new ffmpeg.ChannelLayout(targetChannels === 1 ? "mono" : "stereo")
        }

        // Create resampler to convert to target format
        const resampler = new stream.AudioTransform({
          input: inputDef,
          output: outputDef
        })

        // Pipe decoder output through resampler
        decoder.pipe(resampler)

        resampler.on("data", (frame: { data: Buffer }) => {
          // Convert Buffer to Float32Array
          const float32 = new Float32Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 4)
          chunks.push(float32)
          totalSamples += float32.length
        })

        resampler.on("end", () => {
          // Concatenate all chunks into a single Float32Array
          const samples = new Float32Array(totalSamples)
          let offset = 0
          for (const chunk of chunks) {
            samples.set(chunk, offset)
            offset += chunk.length
          }

          resolve({
            samples,
            sampleRate: targetSampleRate,
            durationSeconds: totalSamples / targetSampleRate
          })
        })

        resampler.on("error", (err: Error) => {
          reject(err)
        })
        decoder.on("error", (err: Error) => {
          reject(err)
        })

        // Discard other streams to prevent memory buildup
        for (const video of demuxer.video) {
          video.resume()
        }
        for (let i = 1; i < demuxer.audio.length; i++) {
          const extra = demuxer.audio[i]
          if (extra !== undefined) {
            extra.resume()
          }
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  })
}

/**
 * Stream audio samples from a file
 *
 * Yields Float32Array chunks as they are decoded, allowing
 * transcription to start before the entire file is processed.
 *
 * @param audioPath - Path to the audio file
 * @param options - Preprocessing options
 */
export async function* streamAudioSamples(
  audioPath: string,
  options: AudioPreprocessOptions = {}
): AsyncGenerator<Float32Array, void, unknown> {
  const targetSampleRate = options.sampleRate ?? 16000
  const targetChannels = options.channels ?? 1

  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`)
  }

  const { ffmpeg, stream } = loadFFmpeg()

  // Create an async queue for samples
  const queue: Float32Array[] = []
  let done = false
  let streamError: Error | null = null
  let resolveWait: (() => void) | null = null

  const demuxer = new stream.Demuxer({ inputFile: audioPath })

  const waitForData = (): Promise<void> => {
    if (queue.length > 0 || done) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      resolveWait = resolve
    })
  }

  const signalReady = (): void => {
    if (resolveWait !== null) {
      resolveWait()
      resolveWait = null
    }
  }

  demuxer.on("error", (err: Error) => {
    streamError = err
    done = true
    signalReady()
  })

  demuxer.on("ready", () => {
    try {
      const audioStream = demuxer.audio[0]
      if (audioStream === undefined) {
        streamError = new Error("No audio stream found in file")
        done = true
        signalReady()
        return
      }

      const decoder = new stream.AudioDecoder({ stream: audioStream.stream })
      const inputDef = decoder.definition()

      const outputDef: AudioStreamDefinition = {
        type: "Audio",
        bitRate: inputDef.bitRate,
        codec: inputDef.codec,
        sampleRate: targetSampleRate,
        sampleFormat: new ffmpeg.SampleFormat("flt"),
        channelLayout: new ffmpeg.ChannelLayout(targetChannels === 1 ? "mono" : "stereo")
      }

      const resampler = new stream.AudioTransform({
        input: inputDef,
        output: outputDef
      })

      decoder.pipe(resampler)

      resampler.on("data", (frame: { data: Buffer }) => {
        const float32 = new Float32Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 4)
        queue.push(float32)
        signalReady()
      })

      resampler.on("end", () => {
        done = true
        signalReady()
      })

      resampler.on("error", (err: Error) => {
        streamError = err
        done = true
        signalReady()
      })

      // Discard other streams
      for (const video of demuxer.video) {
        video.resume()
      }
      for (let i = 1; i < demuxer.audio.length; i++) {
        const extra = demuxer.audio[i]
        if (extra !== undefined) {
          extra.resume()
        }
      }
    } catch (err) {
      streamError = err instanceof Error ? err : new Error(String(err))
      done = true
      signalReady()
    }
  })

  // Yield samples as they become available
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    await waitForData()

    // Check for errors - streamError can be set asynchronously
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (streamError !== null) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw streamError
    }

    // Yield all available chunks
    while (queue.length > 0) {
      const chunk = queue.shift()
      if (chunk !== undefined) {
        yield chunk
      }
    }

    // Exit when done and queue is empty - done can be set asynchronously
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (done && queue.length === 0) {
      break
    }
  }
}

/**
 * Get audio file duration by preprocessing
 *
 * Note: This fully decodes the audio to get accurate duration.
 * For large files, consider using preprocessAudio which returns duration.
 *
 * @param audioPath - Path to the audio file
 * @returns Duration in seconds
 */
export async function getAudioDuration(audioPath: string): Promise<number> {
  const result = await preprocessAudio(audioPath)
  return result.durationSeconds
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

  try {
    const { stream } = loadFFmpeg()

    return await new Promise((resolve) => {
      const demuxer = new stream.Demuxer({ inputFile: audioPath })

      demuxer.on("error", () => {
        resolve(false)
      })

      demuxer.on("ready", () => {
        const hasAudio = demuxer.audio.length > 0

        // Clean up
        for (const video of demuxer.video) {
          video.resume()
        }
        for (const audio of demuxer.audio) {
          audio.resume()
        }

        resolve(hasAudio)
      })
    })
  } catch {
    return false
  }
}
