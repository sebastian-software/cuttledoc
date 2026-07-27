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
  /** Explicit recognition model identifier. */
  model?: string;
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
  /**
   * Recognition backend. `auto` remains local-only; hosted transcription must
   * be selected explicitly.
   */
  backend?: 'auto' | 'apple-speech' | 'whisper' | 'openai-transcription';
  /**
   * Explicit recognition model identifier. OpenAI accepts
   * `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, or `whisper-1`.
   */
  model?: string;
  /** Explicit model file override for Cuttledoc-managed model backends. */
  modelPath?: string;
  /**
   * Ephemeral hosted credential. The native boundary does not return, log, or
   * persist it. When omitted, explicit OpenAI transcription reads
   * `OPENAI_API_KEY`.
   */
  credential?: string;
  /** Hosted request timeout in milliseconds. Defaults to 300,000. */
  timeoutMs?: number;
  /**
   * FFmpeg executable override. Local recognition checks `FFMPEG_PATH` and
   * then the process `PATH`; explicit hosted recognition uploads the original
   * file without invoking FFmpeg.
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
 * Transcribe a media file through an explicitly selected hosted backend or
 * the Rust-owned local audio pipeline.
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
