/**
 * Available backend types for transcription
 */
export const BACKEND_TYPES = {
  auto: "auto",
  parakeet: "parakeet",
  whisper: "whisper",
  phi4: "phi4",
  canary: "canary",
  openai: "openai"
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
 * Whisper model variants
 *
 * Note: We use large-v3 (full model) instead of distil-large-v3 because
 * Distil-Whisper is English-only: https://huggingface.co/distil-whisper
 */
export const WHISPER_MODELS = {
  "large-v3": "large-v3"
} as const

export type WhisperModel = (typeof WHISPER_MODELS)[keyof typeof WHISPER_MODELS]

/**
 * OpenAI transcription model variants
 *
 * These are cloud-hosted models that require an OpenAI API key.
 * They offer improved WER over local Whisper models.
 *
 * @see https://openai.com/index/introducing-our-next-generation-audio-models/
 * @see https://platform.openai.com/docs/models/gpt-4o-transcribe
 */
export const OPENAI_TRANSCRIBE_MODELS = {
  /** Best quality, improved WER over Whisper, 50+ languages */
  "gpt-4o-transcribe": "gpt-4o-transcribe",
  /** Smaller, faster, cheaper - good balance of quality and cost */
  "gpt-4o-mini-transcribe": "gpt-4o-mini-transcribe"
} as const

export type OpenAITranscribeModel = (typeof OPENAI_TRANSCRIBE_MODELS)[keyof typeof OPENAI_TRANSCRIBE_MODELS]

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
  /** OpenAI API key (required for 'openai' backend). Can also use OPENAI_API_KEY env var */
  apiKey?: string
  /** Model to use (backend-specific). For OpenAI: 'gpt-4o-transcribe' or 'gpt-4o-mini-transcribe' */
  model?: OpenAITranscribeModel | string
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
  /** Word-level timestamps (Parakeet only) */
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
