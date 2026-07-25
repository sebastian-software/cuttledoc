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

export interface PcmTranscriptionResult {
  text: string;
  language?: string;
  backend: string;
  model?: string;
  mediaDurationMs: number;
  processingDurationMs: number;
  segments: TranscriptSegment[];
}

export interface PcmTranscriptionOptions {
  /** Explicit BCP 47 language tag, such as `en-US` or `de-DE`. */
  language: string;
  /** Sample rate in hertz. Defaults to 16,000. */
  sampleRate?: number;
  signal?: AbortSignal;
}

export declare function version(): string;

export declare function recognitionBackends(): BackendCapability[];

/**
 * Transcribe mono little-endian f32 PCM through the selected local backend.
 *
 * The input bytes are copied before this function returns.
 */
export declare function transcribePcm(
  pcm: Uint8Array,
  options: PcmTranscriptionOptions,
): Promise<PcmTranscriptionResult>;

declare const api: {
  recognitionBackends: typeof recognitionBackends;
  transcribePcm: typeof transcribePcm;
  version: typeof version;
};

export default api;
