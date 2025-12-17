/**
 * Available backend types for transcription
 */
export const BACKEND_TYPES = {
  auto: "auto",
  parakeet: "parakeet",
  canary: "canary",
  whisper: "whisper"
} as const

export type BackendType = (typeof BACKEND_TYPES)[keyof typeof BACKEND_TYPES]

/**
 * Parakeet model variants
 */
export const PARAKEET_MODELS = {
  "parakeet-tdt-0.6b-v3": "parakeet-tdt-0.6b-v3"
} as const

export type ParakeetModel = (typeof PARAKEET_MODELS)[keyof typeof PARAKEET_MODELS]

/**
 * Canary model variants
 */
export const CANARY_MODELS = {
  "canary-1b-v2": "canary-1b-v2"
} as const

export type CanaryModel = (typeof CANARY_MODELS)[keyof typeof CANARY_MODELS]

/**
 * Whisper model variants
 */
export const WHISPER_MODELS = {
  tiny: "tiny",
  base: "base",
  small: "small",
  medium: "medium",
  large: "large"
} as const

export type WhisperModel = (typeof WHISPER_MODELS)[keyof typeof WHISPER_MODELS]

/**
 * Options for transcription
 */
export interface TranscribeOptions {
  /** Language code (e.g., 'de', 'en-US'). Default: auto-detect */
  language?: string
  /** Override default backend */
  backend?: BackendType
  /** Callback for partial results during transcription */
  onProgress?: (partial: PartialResult) => void
}

/**
 * Options for backend configuration
 */
export interface BackendOptions {
  /** Model variant to use */
  model?: string
  /** Custom path to model file */
  modelPath?: string
  /** Use GPU acceleration (default: true) */
  useGPU?: boolean
}

/**
 * Information about an available backend
 */
export interface BackendInfo {
  /** Backend identifier */
  name: BackendType
  /** Whether the backend is available on this system */
  isAvailable: boolean
  /** Supported language codes */
  languages: readonly string[]
  /** Available model variants */
  models: readonly string[]
  /** Whether models need to be downloaded before use */
  requiresDownload: boolean
}

/**
 * Result of a transcription
 */
export interface TranscriptionResult {
  /** Full transcribed text */
  text: string
  /** Segments with timestamps */
  segments: readonly TranscriptionSegment[]
  /** Word-level timestamps (Parakeet/Canary only) */
  words?: readonly WordTimestamp[]
  /** Audio duration in seconds */
  durationSeconds: number
  /** Processing time in seconds */
  processingTimeSeconds: number
  /** Detected or specified language */
  language: string
  /** Which backend was used */
  backend: BackendType
}

/**
 * A segment of transcribed text with timing
 */
export interface TranscriptionSegment {
  /** Transcribed text for this segment */
  text: string
  /** Start time in seconds */
  startSeconds: number
  /** End time in seconds */
  endSeconds: number
  /** Confidence score (0.0 - 1.0) */
  confidence?: number
}

/**
 * Word-level timestamp information
 */
export interface WordTimestamp {
  /** The word */
  word: string
  /** Start time in seconds */
  startSeconds: number
  /** End time in seconds */
  endSeconds: number
  /** Confidence score (0.0 - 1.0) */
  confidence?: number
}

/**
 * Partial transcription result for progress callbacks
 */
export interface PartialResult {
  /** Partial transcribed text */
  text: string
  /** Whether this is the final result */
  isFinal: boolean
}

/**
 * Backend interface that all backends must implement
 */
export interface Backend {
  /** Check if the backend is available on this system */
  isAvailable(): boolean
  /** Transcribe an audio file */
  transcribe(audioPath: string, options?: TranscribeOptions): Promise<TranscriptionResult>
  /** Clean up resources */
  dispose(): Promise<void>
}
