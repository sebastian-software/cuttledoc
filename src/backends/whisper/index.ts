import {
  type Backend,
  type TranscribeOptions,
  type TranscriptionResult,
} from "../../types.js";

/**
 * Whisper.cpp backend for cross-platform support
 *
 * Supports various Whisper model sizes from tiny (75MB) to large (3GB).
 * Uses Metal acceleration on Apple Silicon.
 */
export class WhisperBackend implements Backend {
  /**
   * Check if Whisper bindings are available
   */
  isAvailable(): boolean {
    // TODO: Check if whisper bindings are installed
    return false;
  }

  /**
   * Transcribe an audio file using Whisper
   */
  transcribe(
    _audioPath: string,
    _options: TranscribeOptions = {}
  ): Promise<TranscriptionResult> {
    return Promise.reject(new Error("Whisper backend is not yet implemented"));
  }

  /**
   * Initialize the backend with a specific model
   */
  initialize(_model = "base"): Promise<void> {
    return Promise.reject(new Error("Whisper backend is not yet implemented"));
  }

  /**
   * Clean up resources
   */
  dispose(): Promise<void> {
    // TODO: Release whisper context
    return Promise.resolve();
  }
}
