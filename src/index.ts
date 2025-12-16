import { getAvailableBackends, getBackend, selectBestBackend, setBackend } from "./backend.js";
import {
  BACKEND_TYPES,
  CANARY_MODELS,
  PARAKEET_MODELS,
  WHISPER_MODELS,
  type Backend,
  type BackendInfo,
  type BackendOptions,
  type BackendType,
  type CanaryModel,
  type ParakeetModel,
  type PartialResult,
  type TranscribeOptions,
  type TranscriptionResult,
  type TranscriptionSegment,
  type WhisperModel,
  type WordTimestamp,
} from "./types.js";

// Re-export everything
export { getAvailableBackends, getBackend, selectBestBackend, setBackend };
export { BACKEND_TYPES, CANARY_MODELS, PARAKEET_MODELS, WHISPER_MODELS };
export type {
  Backend,
  BackendInfo,
  BackendOptions,
  BackendType,
  CanaryModel,
  ParakeetModel,
  PartialResult,
  TranscribeOptions,
  TranscriptionResult,
  TranscriptionSegment,
  WhisperModel,
  WordTimestamp,
};

/**
 * Transcribe an audio file using the configured or best available backend
 *
 * @param audioPath - Path to the audio file to transcribe
 * @param options - Transcription options
 * @returns Promise resolving to the transcription result
 */
export async function transcribe(
  audioPath: string,
  options: TranscribeOptions = {}
): Promise<TranscriptionResult> {
  const currentBackend = getBackend();
  const backend: BackendType =
    options.backend ??
    (currentBackend === BACKEND_TYPES.auto ? selectBestBackend(options.language) : currentBackend);

  switch (backend) {
    case BACKEND_TYPES.apple: {
      const { AppleBackend } = await import("./backends/apple/index.js");
      const appleBackend = new AppleBackend();
      try {
        return await appleBackend.transcribe(audioPath, options);
      } finally {
        await appleBackend.dispose();
      }
    }

    case BACKEND_TYPES.parakeet:
    case BACKEND_TYPES.canary: {
      // TODO: Implement Parakeet/Canary backend
      throw new Error(`Backend "${backend}" is not yet implemented`);
    }

    case BACKEND_TYPES.whisper: {
      // TODO: Implement Whisper backend
      throw new Error(`Backend "${backend}" is not yet implemented`);
    }

    case BACKEND_TYPES.auto: {
      // This should never happen as we resolve 'auto' above
      throw new Error("Unexpected 'auto' backend - this is a bug");
    }
  }
}

/**
 * Download a model for the specified backend
 *
 * @param backend - Backend to download model for
 * @param model - Specific model variant to download
 */
export function downloadModel(backend: BackendType, model?: string): Promise<void> {
  switch (backend) {
    case BACKEND_TYPES.apple: {
      // Apple Speech uses built-in models, no download needed
      return Promise.resolve();
    }

    case BACKEND_TYPES.parakeet:
    case BACKEND_TYPES.canary:
    case BACKEND_TYPES.whisper: {
      // TODO: Implement model download
      const modelInfo = model ?? "default";
      return Promise.reject(
        new Error(`Model download for "${backend}" is not yet implemented (model: ${modelInfo})`)
      );
    }

    case BACKEND_TYPES.auto: {
      return Promise.reject(new Error("Cannot download model for 'auto' backend"));
    }
  }
}
