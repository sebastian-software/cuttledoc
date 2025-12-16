import {
  type Backend,
  type TranscribeOptions,
  type TranscriptionResult,
} from "../../types.js";

/**
 * Parakeet/Canary backend using ONNX Runtime
 *
 * Supports NVIDIA NeMo models:
 * - Parakeet TDT 0.6B v3: Fast, 25 EU languages
 * - Canary 1B v2: Accurate, translation support
 */
export class ParakeetBackend implements Backend {
  /**
   * Check if ONNX Runtime is available
   */
  isAvailable(): boolean {
    // TODO: Check if onnxruntime-node is installed
    return false;
  }

  /**
   * Transcribe an audio file using Parakeet/Canary model
   */
  transcribe(
    _audioPath: string,
    _options: TranscribeOptions = {}
  ): Promise<TranscriptionResult> {
    return Promise.reject(new Error("Parakeet backend is not yet implemented"));
  }

  /**
   * Initialize the backend with a specific model
   */
  initialize(_model = "parakeet-tdt-0.6b-v3"): Promise<void> {
    return Promise.reject(new Error("Parakeet backend is not yet implemented"));
  }

  /**
   * Clean up resources
   */
  dispose(): Promise<void> {
    // TODO: Release ONNX session
    return Promise.resolve();
  }
}

export { ParakeetBackend as CanaryBackend };
