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

import type { SherpaBackend } from "./backends/sherpa/index.js";

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

// Cached backend instances for reuse
let sherpaBackendInstance: SherpaBackend | null = null;

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

    case BACKEND_TYPES.parakeet: {
      const { SherpaBackend } = await import("./backends/sherpa/index.js");
      if (sherpaBackendInstance === null) {
        sherpaBackendInstance = new SherpaBackend({ model: "parakeet-tdt-0.6b-v3" });
        await sherpaBackendInstance.initialize();
      }
      return sherpaBackendInstance.transcribe(audioPath, options);
    }

    case BACKEND_TYPES.canary: {
      // Canary uses the same sherpa backend with a different model
      // For now, fall back to parakeet v3
      const { SherpaBackend } = await import("./backends/sherpa/index.js");
      if (sherpaBackendInstance === null) {
        sherpaBackendInstance = new SherpaBackend({ model: "parakeet-tdt-0.6b-v3" });
        await sherpaBackendInstance.initialize();
      }
      return sherpaBackendInstance.transcribe(audioPath, options);
    }

    case BACKEND_TYPES.whisper: {
      const { SherpaBackend } = await import("./backends/sherpa/index.js");
      // Create a new instance for whisper with different model
      const whisperBackend = new SherpaBackend({ model: "whisper-medium" });
      await whisperBackend.initialize();
      try {
        return await whisperBackend.transcribe(audioPath, options);
      } finally {
        await whisperBackend.dispose();
      }
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
export async function downloadModel(backend: BackendType, model?: string): Promise<void> {
  switch (backend) {
    case BACKEND_TYPES.apple: {
      // Apple Speech uses built-in models, no download needed
      return;
    }

    case BACKEND_TYPES.parakeet:
    case BACKEND_TYPES.canary:
    case BACKEND_TYPES.whisper: {
      const { downloadSherpaModel } = await import("./backends/sherpa/download.js");
      await downloadSherpaModel(model ?? "parakeet-tdt-0.6b-v3");
      return;
    }

    case BACKEND_TYPES.auto: {
      throw new Error("Cannot download model for 'auto' backend");
    }
  }
}

/**
 * Clean up all cached backend instances
 */
export async function cleanup(): Promise<void> {
  if (sherpaBackendInstance !== null) {
    await sherpaBackendInstance.dispose();
    sherpaBackendInstance = null;
  }
}
