export interface BackendCapability {
  id: string;
  available: boolean;
  unavailableReason?: string;
}

export interface TranscriptWord {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
  words: TranscriptWord[];
}

export interface TranscriptionResult {
  /** Original successful ASR result, never replaced by enhancement. */
  rawText: string;
  text: string;
  language?: string;
  backend: string;
  model?: string;
  mediaDurationMs: number;
  processingDurationMs: number;
  segments: TranscriptSegment[];
  enhancement?: TranscriptEnhancement;
}

export interface TranscriptEnhancement {
  backend: 'gemma-mlx' | 'openrouter';
  model: string;
  outcome: 'applied' | 'raw_fallback';
  fallbackReason?: string;
  fallbackDetail?: string;
  promptId: string;
  promptSha256: string;
  processingDurationMs: number;
}

/** @deprecated Use `TranscriptionResult`. */
export type PcmTranscriptionResult = TranscriptionResult;

export interface PcmTranscriptionOptions {
  /** Explicit BCP 47 language tag, or `auto` for backends that detect it. */
  language: string;
  /** Local backend selection. Defaults to capability-aware `auto`. */
  backend?: 'auto' | 'apple-speech' | 'whisper';
  /** Explicit model file override for Cuttledoc-managed model backends. */
  modelPath?: string;
  /** Sample rate in hertz. Defaults to 16,000. */
  sampleRate?: number;
  /**
   * Transcript enhancement mode. Defaults to `off` until the 32 GB local
   * runtime gate is complete. `gemini` requires `OPENROUTER_API_KEY`.
   */
  enhancement?: 'off' | 'local' | 'gemini';
  /** Optional Gemma snapshot override; valid only with `enhancement: 'local'`. */
  enhancementModelPath?: string;
  signal?: AbortSignal;
}

export interface FileTranscriptionOptions {
  /** Explicit BCP 47 language tag, or `auto` for backends that detect it. */
  language: string;
  /** Local backend selection. Defaults to capability-aware `auto`. */
  backend?: 'auto' | 'apple-speech' | 'whisper';
  /** Explicit model file override for Cuttledoc-managed model backends. */
  modelPath?: string;
  /**
   * FFmpeg executable override. Resolution otherwise checks `FFMPEG_PATH` and
   * then the process `PATH`.
   */
  ffmpegPath?: string;
  /**
   * Transcript enhancement mode. Defaults to `off` until the 32 GB local
   * runtime gate is complete. `gemini` requires `OPENROUTER_API_KEY`.
   */
  enhancement?: 'off' | 'local' | 'gemini';
  /** Optional Gemma snapshot override; valid only with `enhancement: 'local'`. */
  enhancementModelPath?: string;
  signal?: AbortSignal;
}

export declare function version(): string;

export declare function recognitionBackends(): BackendCapability[];

export declare function textGenerationBackends(): BackendCapability[];

/**
 * Decode and transcribe a media file through the Rust-owned audio pipeline.
 */
export declare function transcribeFile(
  path: string,
  options: FileTranscriptionOptions,
): Promise<TranscriptionResult>;

/**
 * Transcribe mono little-endian f32 PCM through the selected local backend.
 *
 * The input bytes are copied before this function returns.
 */
export declare function transcribePcm(
  pcm: Uint8Array,
  options: PcmTranscriptionOptions,
): Promise<TranscriptionResult>;

declare const api: {
  recognitionBackends: typeof recognitionBackends;
  textGenerationBackends: typeof textGenerationBackends;
  transcribeFile: typeof transcribeFile;
  transcribePcm: typeof transcribePcm;
  version: typeof version;
};

export default api;
