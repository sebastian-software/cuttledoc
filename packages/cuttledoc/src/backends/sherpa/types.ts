/**
 * Sherpa-ONNX configuration types
 */

/**
 * Feature extraction config
 */
export interface SherpaFeatConfig {
  sampleRate: number
  featureDim: number
}

/**
 * Transducer model config (for Parakeet, Zipformer, etc.)
 */
export interface SherpaTransducerConfig {
  encoder: string
  decoder: string
  joiner: string
}

/**
 * Whisper model config
 */
export interface SherpaWhisperConfig {
  encoder: string
  decoder: string
  language?: string
  task?: "transcribe" | "translate"
}

/**
 * Model configuration
 */
export interface SherpaModelConfig {
  transducer?: SherpaTransducerConfig
  whisper?: SherpaWhisperConfig
  tokens: string
  numThreads?: number
  provider?: "cpu" | "cuda" | "coreml"
  debug?: number
  modelType?: string
}

/**
 * Full recognizer config
 */
export interface SherpaRecognizerConfig {
  featConfig: SherpaFeatConfig
  modelConfig: SherpaModelConfig
}

/**
 * Wave file data returned by readWave
 */
export interface SherpaWaveData {
  samples: Float32Array
  sampleRate: number
}

/**
 * Recognition result from sherpa-onnx
 */
export interface SherpaRecognitionResult {
  text: string
  tokens?: string[]
  timestamps?: number[]
  lang?: string
}

/**
 * Offline stream interface
 */
export interface SherpaOfflineStream {
  acceptWaveform(data: { sampleRate: number; samples: Float32Array }): void
}

/**
 * Offline recognizer interface
 */
export interface SherpaOfflineRecognizer {
  createStream(): SherpaOfflineStream
  decode(stream: SherpaOfflineStream): void
  getResult(stream: SherpaOfflineStream): SherpaRecognitionResult
}

/**
 * Sherpa-ONNX module interface
 */
export interface SherpaModule {
  OfflineRecognizer: new (config: SherpaRecognizerConfig) => SherpaOfflineRecognizer
  readWave(filename: string): SherpaWaveData
  writeWave(filename: string, data: { samples: Float32Array; sampleRate: number }): void
  version: string
  gitSha1: string
  gitDate: string
}

/**
 * Supported model types for sherpa backend
 */
export const SHERPA_MODEL_TYPES = {
  "parakeet-tdt-0.6b-v3": "parakeet-tdt-0.6b-v3",
  "whisper-distil-large-v3": "whisper-distil-large-v3"
} as const

export type SherpaModelType = (typeof SHERPA_MODEL_TYPES)[keyof typeof SHERPA_MODEL_TYPES]

/**
 * Model metadata for download and configuration
 */
export interface SherpaModelInfo {
  type: "transducer" | "whisper"
  /** Download source: github (tar.bz2) or huggingface (individual files) */
  source: "github" | "huggingface"
  /** For github: full URL to tar.bz2. For huggingface: repo name (e.g., "csukuangfj/sherpa-onnx-whisper-distil-large-v3") */
  downloadUrl: string
  folderName: string
  files: {
    encoder: string
    decoder: string
    joiner?: string
    tokens: string
  }
  modelType?: string
  languages: readonly string[]
  sizeBytes: number
}

/**
 * Model registry with download URLs and file paths
 */
export const SHERPA_MODELS: Record<SherpaModelType, SherpaModelInfo> = {
  "parakeet-tdt-0.6b-v3": {
    type: "transducer",
    source: "github",
    downloadUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    folderName: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    files: {
      encoder: "encoder.int8.onnx",
      decoder: "decoder.int8.onnx",
      joiner: "joiner.int8.onnx",
      tokens: "tokens.txt"
    },
    modelType: "nemo_transducer",
    languages: [
      "en", // English
      "de", // German
      "fr", // French
      "es", // Spanish
      "it", // Italian
      "pt", // Portuguese
      "nl", // Dutch
      "pl", // Polish
      "cs", // Czech
      "sk", // Slovak
      "hu", // Hungarian
      "ro", // Romanian
      "bg", // Bulgarian
      "el", // Greek
      "sv", // Swedish
      "da", // Danish
      "fi", // Finnish
      "no", // Norwegian
      "hr", // Croatian
      "sl", // Slovenian
      "et", // Estonian
      "lv", // Latvian
      "lt", // Lithuanian
      "mt", // Maltese
      "uk" // Ukrainian
    ],
    sizeBytes: 160_000_000
  },
  "whisper-distil-large-v3": {
    type: "whisper",
    source: "huggingface",
    downloadUrl: "csukuangfj/sherpa-onnx-whisper-distil-large-v3",
    folderName: "sherpa-onnx-whisper-distil-large-v3",
    files: {
      encoder: "distil-large-v3-encoder.int8.onnx",
      decoder: "distil-large-v3-decoder.int8.onnx",
      tokens: "distil-large-v3-tokens.txt"
    },
    languages: ["multilingual"],
    sizeBytes: 983_000_000 // ~668MB encoder + ~315MB decoder
  }
} as const
