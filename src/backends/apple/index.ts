import {
  BACKEND_TYPES,
  type Backend,
  type TranscribeOptions,
  type TranscriptionResult,
} from "../../types.js";

/**
 * Apple Speech Framework backend for macOS
 *
 * Uses the native SFSpeechRecognizer for on-device transcription.
 * Requires macOS 12.0+ and speech recognition permissions.
 */
export class AppleBackend implements Backend {
  /**
   * Check if Apple Speech is available on this system
   */
  isAvailable(): boolean {
    // TODO: Check native binding availability
    return process.platform === "darwin";
  }

  /**
   * Transcribe an audio file using Apple Speech Framework
   */
  transcribe(audioPath: string, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
    if (!this.isAvailable()) {
      return Promise.reject(new Error("Apple Speech backend is only available on macOS"));
    }

    const startTime = performance.now();
    const language = options.language ?? "en-US";

    // TODO: Call native binding
    // For now, return a placeholder result
    const result: TranscriptionResult = {
      text: `[Apple Speech placeholder for: ${audioPath}]`,
      segments: [],
      durationSeconds: 0,
      processingTimeSeconds: (performance.now() - startTime) / 1000,
      language,
      backend: BACKEND_TYPES.apple,
    };

    return Promise.resolve(result);
  }

  /**
   * Clean up resources
   */
  dispose(): Promise<void> {
    // No cleanup needed for Apple Speech
    return Promise.resolve();
  }
}
