/**
 * Sherpa-ONNX configuration types
 */

/**
 * Feature extraction config
 */
export interface SherpaFeatConfig {
  sampleRate: number;
  featureDim: number;
}

/**
 * Transducer model config (for Parakeet, Zipformer, etc.)
 */
export interface SherpaTransducerConfig {
  encoder: string;
  decoder: string;
  joiner: string;
}

/**
 * Whisper model config
 */
export interface SherpaWhisperConfig {
  encoder: string;
  decoder: string;
  language?: string;
  task?: "transcribe" | "translate";
}

/**
 * Model configuration
 */
export interface SherpaModelConfig {
  transducer?: SherpaTransducerConfig;
  whisper?: SherpaWhisperConfig;
  tokens: string;
  numThreads?: number;
  provider?: "cpu" | "cuda" | "coreml";
  debug?: number;
  modelType?: string;
}

/**
 * Full recognizer config
 */
export interface SherpaRecognizerConfig {
  featConfig: SherpaFeatConfig;
  modelConfig: SherpaModelConfig;
}

/**
 * Wave file data returned by readWave
 */
export interface SherpaWaveData {
  samples: Float32Array;
  sampleRate: number;
}

/**
 * Recognition result from sherpa-onnx
 */
export interface SherpaRecognitionResult {
  text: string;
  tokens?: string[];
  timestamps?: number[];
  lang?: string;
}

/**
 * Offline stream interface
 */
export interface SherpaOfflineStream {
  acceptWaveform(data: { sampleRate: number; samples: Float32Array }): void;
}

/**
 * Offline recognizer interface
 */
export interface SherpaOfflineRecognizer {
  createStream(): SherpaOfflineStream;
  decode(stream: SherpaOfflineStream): void;
  getResult(stream: SherpaOfflineStream): SherpaRecognitionResult;
}

/**
 * Sherpa-ONNX module interface
 */
export interface SherpaModule {
  OfflineRecognizer: new (config: SherpaRecognizerConfig) => SherpaOfflineRecognizer;
  readWave(filename: string): SherpaWaveData;
  writeWave(filename: string, data: { samples: Float32Array; sampleRate: number }): void;
  version: string;
  gitSha1: string;
  gitDate: string;
}

/**
 * Supported model types for sherpa backend
 */
export const SHERPA_MODEL_TYPES = {
  "parakeet-tdt-0.6b-v2": "parakeet-tdt-0.6b-v2",
  "parakeet-tdt-0.6b-v3": "parakeet-tdt-0.6b-v3",
  "whisper-tiny": "whisper-tiny",
  "whisper-base": "whisper-base",
  "whisper-small": "whisper-small",
  "whisper-medium": "whisper-medium",
  "whisper-large-v3": "whisper-large-v3",
} as const;

export type SherpaModelType = (typeof SHERPA_MODEL_TYPES)[keyof typeof SHERPA_MODEL_TYPES];

/**
 * Model metadata for download and configuration
 */
export interface SherpaModelInfo {
  type: "transducer" | "whisper";
  downloadUrl: string;
  folderName: string;
  files: {
    encoder: string;
    decoder: string;
    joiner?: string;
    tokens: string;
  };
  modelType?: string;
  languages: readonly string[];
  sizeBytes: number;
}

/**
 * Model registry with download URLs and file paths
 */
export const SHERPA_MODELS: Record<SherpaModelType, SherpaModelInfo> = {
  "parakeet-tdt-0.6b-v2": {
    type: "transducer",
    downloadUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2",
    folderName: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8",
    files: {
      encoder: "encoder.int8.onnx",
      decoder: "decoder.int8.onnx",
      joiner: "joiner.int8.onnx",
      tokens: "tokens.txt",
    },
    modelType: "nemo_transducer",
    languages: ["en", "de", "fr", "es", "it", "pt", "nl", "pl", "cs", "sk", "hu", "ro", "bg", "el", "sv", "da", "fi", "no", "hr", "sl", "et", "lv", "lt", "mt", "ru", "uk"],
    sizeBytes: 160_000_000,
  },
  "parakeet-tdt-0.6b-v3": {
    type: "transducer",
    downloadUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    folderName: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    files: {
      encoder: "encoder.int8.onnx",
      decoder: "decoder.int8.onnx",
      joiner: "joiner.int8.onnx",
      tokens: "tokens.txt",
    },
    modelType: "nemo_transducer",
    languages: ["en", "de", "fr", "es", "it", "pt", "nl", "pl", "cs", "sk", "hu", "ro", "bg", "el", "sv", "da", "fi", "no", "hr", "sl", "et", "lv", "lt", "mt", "ru", "uk"],
    sizeBytes: 160_000_000,
  },
  "whisper-tiny": {
    type: "whisper",
    downloadUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2",
    folderName: "sherpa-onnx-whisper-tiny",
    files: {
      encoder: "tiny-encoder.int8.onnx",
      decoder: "tiny-decoder.int8.onnx",
      tokens: "tiny-tokens.txt",
    },
    languages: ["multilingual"],
    sizeBytes: 40_000_000,
  },
  "whisper-base": {
    type: "whisper",
    downloadUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2",
    folderName: "sherpa-onnx-whisper-base",
    files: {
      encoder: "base-encoder.int8.onnx",
      decoder: "base-decoder.int8.onnx",
      tokens: "base-tokens.txt",
    },
    languages: ["multilingual"],
    sizeBytes: 80_000_000,
  },
  "whisper-small": {
    type: "whisper",
    downloadUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2",
    folderName: "sherpa-onnx-whisper-small",
    files: {
      encoder: "small-encoder.int8.onnx",
      decoder: "small-decoder.int8.onnx",
      tokens: "small-tokens.txt",
    },
    languages: ["multilingual"],
    sizeBytes: 250_000_000,
  },
  "whisper-medium": {
    type: "whisper",
    downloadUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-medium.tar.bz2",
    folderName: "sherpa-onnx-whisper-medium",
    files: {
      encoder: "medium-encoder.int8.onnx",
      decoder: "medium-decoder.int8.onnx",
      tokens: "medium-tokens.txt",
    },
    languages: ["multilingual"],
    sizeBytes: 500_000_000,
  },
  "whisper-large-v3": {
    type: "whisper",
    downloadUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-large-v3.tar.bz2",
    folderName: "sherpa-onnx-whisper-large-v3",
    files: {
      encoder: "large-v3-encoder.int8.onnx",
      decoder: "large-v3-decoder.int8.onnx",
      tokens: "large-v3-tokens.txt",
    },
    languages: ["multilingual"],
    sizeBytes: 1_600_000_000,
  },
} as const;

