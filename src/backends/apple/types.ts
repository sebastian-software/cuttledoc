/**
 * Native Apple Speech bindings interface
 */
export interface AppleNativeBindings {
  /**
   * Transcribe an audio file
   */
  transcribe(audioPath: string, options: AppleTranscribeOptions): Promise<AppleNativeResult>;

  /**
   * Check if speech recognition is available
   */
  isAvailable(): boolean;
}

/**
 * Options for the native Apple Speech binding
 */
export interface AppleTranscribeOptions {
  /** Locale identifier (e.g., 'en-US', 'de-DE') */
  language: string;
  /** Only use on-device recognition (no server) */
  onDeviceOnly: boolean;
}

/**
 * Raw result from the native Apple Speech binding
 */
export interface AppleNativeResult {
  /** Transcribed text */
  text: string;
  /** Segments with timing (if available) */
  segments?: readonly AppleNativeSegment[];
}

/**
 * Segment from native Apple Speech result
 */
export interface AppleNativeSegment {
  text: string;
  startSeconds: number;
  endSeconds: number;
  confidence?: number;
}

