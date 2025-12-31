/**
 * Audio preprocessing utilities
 *
 * Re-exports from @cuttledoc/ffmpeg for audio decoding,
 * plus additional utilities for speech recognition.
 */

// Re-export from @cuttledoc/ffmpeg
export {
  decodeAudio,
  isFFmpegAvailable,
  ffmpegPath,
  ffmpegVersion,
  type DecodeOptions,
  type AudioData
} from "@cuttledoc/ffmpeg"

// Legacy exports for backwards compatibility
export type { AudioData as AudioSamples } from "@cuttledoc/ffmpeg"
export type { DecodeOptions as AudioPreprocessOptions } from "@cuttledoc/ffmpeg"

/**
 * @deprecated Use decodeAudio from @cuttledoc/ffmpeg instead
 */
export { decodeAudio as preprocessAudio } from "@cuttledoc/ffmpeg"

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
