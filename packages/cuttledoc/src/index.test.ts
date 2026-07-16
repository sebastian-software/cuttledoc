import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BACKEND_TYPES, type BackendType, type TranscribeOptions, type TranscriptionResult } from "./types.js"

const mocks = vi.hoisted(() => ({
  constructCoreMLBackend: vi.fn<(model: BackendType) => void>(),
  coremlDispose: vi.fn<() => Promise<void>>(),
  coremlInitialize: vi.fn<(language?: string) => Promise<void>>(),
  coremlTranscribe: vi.fn<(audioPath: string, options: TranscribeOptions) => Promise<TranscriptionResult>>(),
  downloadWhisperCoreMLModel: vi.fn<() => Promise<string>>(),
  downloadWhisperModel: vi.fn<() => Promise<string>>(),
  getBackend: vi.fn<() => BackendType>(),
  selectBestBackend: vi.fn<(language?: string, apiKey?: string) => BackendType>()
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

    initialize(language?: string): Promise<void> {
      return mocks.coremlInitialize(language)
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

vi.mock("whisper-coreml", () => ({
  downloadCoreMLModel: mocks.downloadWhisperCoreMLModel,
  downloadModel: mocks.downloadWhisperModel
}))

import { cleanup, downloadModel, transcribe } from "./index.js"

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

    expect(mocks.selectBestBackend).toHaveBeenCalledWith("en", undefined)
    expect(mocks.constructCoreMLBackend).toHaveBeenCalledWith(BACKEND_TYPES.parakeet)
  })

  it("uses the call-level API key for automatic backend selection", async () => {
    await transcribe("audio.mp3", { backend: BACKEND_TYPES.auto, language: "en", apiKey: "test-key" })

    expect(mocks.selectBestBackend).toHaveBeenCalledWith("en", "test-key")
  })

  it("resolves an omitted backend when the configured backend is auto", async () => {
    await transcribe("audio.mp3", { language: "de" })

    expect(mocks.getBackend).toHaveBeenCalledOnce()
    expect(mocks.selectBestBackend).toHaveBeenCalledWith("de", undefined)
    expect(mocks.constructCoreMLBackend).toHaveBeenCalledWith(BACKEND_TYPES.parakeet)
  })

  it("uses an explicit concrete backend without auto-selection", async () => {
    await transcribe("audio.mp3", { backend: BACKEND_TYPES.whisper })

    expect(mocks.getBackend).not.toHaveBeenCalled()
    expect(mocks.selectBestBackend).not.toHaveBeenCalled()
    expect(mocks.constructCoreMLBackend).toHaveBeenCalledWith(BACKEND_TYPES.whisper)
  })

  it("initializes Whisper with the requested language", async () => {
    await transcribe("audio.mp3", { backend: BACKEND_TYPES.whisper, language: "de" })

    expect(mocks.coremlInitialize).toHaveBeenCalledWith("de")
  })

  it("caches Whisper backends separately for each language", async () => {
    await transcribe("german.mp3", { backend: BACKEND_TYPES.whisper, language: "de" })
    await transcribe("english.mp3", { backend: BACKEND_TYPES.whisper, language: "en" })

    expect(mocks.constructCoreMLBackend).toHaveBeenCalledTimes(2)
    expect(mocks.coremlInitialize).toHaveBeenNthCalledWith(1, "de")
    expect(mocks.coremlInitialize).toHaveBeenNthCalledWith(2, "en")
  })

  it("reuses a cached Whisper backend for the same language", async () => {
    await transcribe("first.mp3", { backend: BACKEND_TYPES.whisper, language: "de" })
    await transcribe("second.mp3", { backend: BACKEND_TYPES.whisper, language: "de" })

    expect(mocks.constructCoreMLBackend).toHaveBeenCalledOnce()
    expect(mocks.coremlInitialize).toHaveBeenCalledOnce()
  })

  it("reuses the language-independent Parakeet backend", async () => {
    await transcribe("german.mp3", { backend: BACKEND_TYPES.parakeet, language: "de" })
    await transcribe("english.mp3", { backend: BACKEND_TYPES.parakeet, language: "en" })

    expect(mocks.constructCoreMLBackend).toHaveBeenCalledOnce()
    expect(mocks.coremlInitialize).toHaveBeenCalledOnce()
    expect(mocks.coremlInitialize).toHaveBeenCalledWith(undefined)
  })
})

describe("downloadModel", () => {
  it("downloads both Whisper model artifacts", async () => {
    mocks.downloadWhisperModel.mockResolvedValue("/models/ggml-large-v3-turbo.bin")
    mocks.downloadWhisperCoreMLModel.mockResolvedValue("/models/ggml-large-v3-turbo-encoder.mlmodelc")

    await downloadModel(BACKEND_TYPES.whisper)

    expect(mocks.downloadWhisperModel).toHaveBeenCalledOnce()
    expect(mocks.downloadWhisperCoreMLModel).toHaveBeenCalledOnce()
    expect(mocks.downloadWhisperModel.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.downloadWhisperCoreMLModel.mock.invocationCallOrder[0] ?? 0
    )
  })
})
