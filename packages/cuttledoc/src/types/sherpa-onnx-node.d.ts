/**
 * Type declarations for sherpa-onnx-node
 *
 * The package doesn't ship its own types, so we declare the module
 * to satisfy TypeScript. The actual types are defined in ./sherpa/types.ts
 */
declare module "sherpa-onnx-node" {
  export const OfflineRecognizer: unknown
  export function readWave(filename: string): { samples: Float32Array; sampleRate: number }
  export function writeWave(filename: string, data: { samples: Float32Array; sampleRate: number }): void
  export const version: string
  export const gitSha1: string
  export const gitDate: string

  /**
   * Silero VAD (Voice Activity Detection) configuration
   */
  export interface SileroVadConfig {
    /** Path to silero_vad.onnx model file */
    model: string
    /** Threshold for speech detection (default: 0.5) */
    threshold?: number
    /** Minimum silence duration in seconds before ending speech (default: 0.5) */
    minSilenceDuration?: number
    /** Minimum speech duration in seconds (default: 0.25) */
    minSpeechDuration?: number
    /** Maximum speech duration in seconds (default: 5) */
    maxSpeechDuration?: number
    /** Number of threads (default: 1) */
    numThreads?: number
    /** Sample rate (default: 16000) */
    sampleRate?: number
  }

  export interface VadConfig {
    sileroVad: SileroVadConfig
  }

  /**
   * Speech segment detected by VAD
   */
  export interface VadSpeechSegment {
    /** Audio samples (Float32Array) */
    samples: Float32Array
    /** Start sample index in original audio */
    start: number
  }

  /**
   * Voice Activity Detector using Silero VAD
   */
  export class Vad {
    constructor(config: VadConfig, bufferSizeInSeconds: number)

    /** Accept audio samples for processing */
    acceptWaveform(samples: Float32Array): void

    /** Check if speech segment queue is empty */
    isEmpty(): boolean

    /** Check if speech is currently detected */
    isDetected(): boolean

    /** Remove the front segment from queue */
    pop(): void

    /** Clear all pending segments */
    clear(): void

    /** Get the front speech segment */
    front(enableExternalBuffer?: boolean): VadSpeechSegment

    /** Reset the VAD state */
    reset(): void

    /** Flush remaining audio (call at end of stream) */
    flush(): void
  }

  /**
   * Circular buffer for audio samples
   */
  export class CircularBuffer {
    constructor(capacity: number)

    /** Push samples to buffer */
    push(samples: Float32Array): void

    /** Get samples from buffer */
    get(startIndex: number, n: number, enableExternalBuffer?: boolean): Float32Array

    /** Pop samples from buffer */
    pop(n: number): Float32Array

    /** Get current buffer size */
    size(): number

    /** Get head position */
    head(): number

    /** Reset buffer */
    reset(): void
  }
}
