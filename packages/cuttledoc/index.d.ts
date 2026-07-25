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
  text: string;
  language?: string;
  backend: string;
  model?: string;
  mediaDurationMs: number;
  processingDurationMs: number;
  segments: TranscriptSegment[];
}

/** @deprecated Use `TranscriptionResult`. */
export type PcmTranscriptionResult = TranscriptionResult;

export interface PcmTranscriptionOptions {
  /** Explicit BCP 47 language tag, such as `en-US` or `de-DE`. */
  language: string;
  /** Sample rate in hertz. Defaults to 16,000. */
  sampleRate?: number;
  signal?: AbortSignal;
}

export interface FileTranscriptionOptions {
  /** Explicit BCP 47 language tag, such as `en-US` or `de-DE`. */
  language: string;
  /**
   * FFmpeg executable override. Resolution otherwise checks `FFMPEG_PATH` and
   * then the process `PATH`.
   */
  ffmpegPath?: string;
  signal?: AbortSignal;
}

export declare function version(): string;

export declare function recognitionBackends(): BackendCapability[];

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
  transcribeFile: typeof transcribeFile;
  transcribePcm: typeof transcribePcm;
  version: typeof version;
};

export default api;
