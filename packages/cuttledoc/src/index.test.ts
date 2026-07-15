import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BACKEND_TYPES, type BackendType, type TranscribeOptions, type TranscriptionResult } from "./types.js"

const mocks = vi.hoisted(() => ({
  constructCoreMLBackend: vi.fn<(model: BackendType) => void>(),
  coremlDispose: vi.fn<() => Promise<void>>(),
  coremlInitialize: vi.fn<() => Promise<void>>(),
  coremlTranscribe: vi.fn<(audioPath: string, options: TranscribeOptions) => Promise<TranscriptionResult>>(),
  getBackend: vi.fn<() => BackendType>(),
  selectBestBackend: vi.fn<(language?: string) => BackendType>()
}))

vi.mock("./backend.js", () => ({
  getAvailableBackends: vi.fn(),
  getBackend: mocks.getBackend,
  selectBestBackend: mocks.selectBestBackend,
  setBackend: vi.fn()
}))

vi.mock("./backends/coreml/index.js", () => ({
  COREML_MODELS: {},
  COREML_MODEL_TYPES: {
    parakeet: "parakeet",
    whisper: "whisper"
  },
  CoreMLBackend: class {
    constructor(options: { model: BackendType }) {
      mocks.constructCoreMLBackend(options.model)
    }

    initialize(): Promise<void> {
      return mocks.coremlInitialize()
    }

    transcribe(audioPath: string, options: TranscribeOptions): Promise<TranscriptionResult> {
      return mocks.coremlTranscribe(audioPath, options)
    }

    dispose(): Promise<void> {
      return mocks.coremlDispose()
    }
  }
}))

vi.mock("@cuttledoc/llm", () => ({
  LOCAL_MODELS: {},
  downloadModel: vi.fn(),
  isModelDownloaded: vi.fn()
}))

import { cleanup, transcribe } from "./index.js"

const transcriptionResult: TranscriptionResult = {
  backend: BACKEND_TYPES.parakeet,
  durationSeconds: 1,
  language: "en",
  processingTimeSeconds: 0.1,
  segments: [],
  text: "transcribed"
}

describe("transcribe backend resolution", () => {
  beforeEach(() => {
    mocks.coremlDispose.mockResolvedValue()
    mocks.coremlInitialize.mockResolvedValue()
    mocks.coremlTranscribe.mockResolvedValue(transcriptionResult)
    mocks.getBackend.mockReturnValue(BACKEND_TYPES.auto)
    mocks.selectBestBackend.mockReturnValue(BACKEND_TYPES.parakeet)
  })

  afterEach(async () => {
    await cleanup()
    vi.clearAllMocks()
  })

  it("resolves an explicit auto backend", async () => {
    await transcribe("audio.mp3", { backend: BACKEND_TYPES.auto, language: "en" })

    expect(mocks.selectBestBackend).toHaveBeenCalledWith("en")
    expect(mocks.constructCoreMLBackend).toHaveBeenCalledWith(BACKEND_TYPES.parakeet)
  })

  it("resolves an omitted backend when the configured backend is auto", async () => {
    await transcribe("audio.mp3", { language: "de" })

    expect(mocks.getBackend).toHaveBeenCalledOnce()
    expect(mocks.selectBestBackend).toHaveBeenCalledWith("de")
    expect(mocks.constructCoreMLBackend).toHaveBeenCalledWith(BACKEND_TYPES.parakeet)
  })

  it("uses an explicit concrete backend without auto-selection", async () => {
    await transcribe("audio.mp3", { backend: BACKEND_TYPES.whisper })

    expect(mocks.getBackend).not.toHaveBeenCalled()
    expect(mocks.selectBestBackend).not.toHaveBeenCalled()
    expect(mocks.constructCoreMLBackend).toHaveBeenCalledWith(BACKEND_TYPES.whisper)
  })
})
