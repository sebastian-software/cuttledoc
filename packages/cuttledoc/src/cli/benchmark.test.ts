import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  transcribe: vi.fn(),
  dispose: vi.fn()
}))

vi.mock("../backends/coreml/index.js", () => ({
  COREML_MODELS: { whisper: {} },
  CoreMLBackend: class {
    initialize = mocks.initialize
    transcribe = mocks.transcribe
    dispose = mocks.dispose
  }
}))

vi.mock("../index.js", () => ({
  BACKEND_TYPES: { parakeet: "parakeet", whisper: "whisper" },
  isModelDownloaded: vi.fn()
}))

import { benchmarkModel, parseBenchmarkOptions, validateAudioDuration } from "./benchmark.js"

const temporaryDirectories: string[] = []

describe("benchmarkModel", () => {
  beforeEach(() => {
    mocks.initialize.mockReset().mockResolvedValue(undefined)
    mocks.transcribe.mockReset()
    mocks.dispose.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it("uses the backend's decoded duration for shell-sensitive filenames", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cuttledoc-benchmark-"))
    temporaryDirectories.push(directory)
    const audio = join(directory, "x$(touch should-not-exist).ogg")
    const reference = join(directory, "reference.md")
    writeFileSync(reference, "hello world")
    mocks.transcribe.mockResolvedValue({ text: "hello world", durationSeconds: 12.5 })

    const result = await benchmarkModel("whisper", [{ audio, reference }])

    expect(mocks.transcribe).toHaveBeenCalledExactlyOnceWith(audio)
    expect(result.samples[0]?.durationSeconds).toBe(12.5)
    expect(result.totalAudioSeconds).toBe(12.5)
    expect(result.averageWER.wer).toBe(0)
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it("fails loudly and disposes the backend when duration is invalid", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cuttledoc-benchmark-"))
    temporaryDirectories.push(directory)
    const audio = join(directory, "broken.ogg")
    const reference = join(directory, "reference.md")
    writeFileSync(reference, "hello world")
    mocks.transcribe.mockResolvedValue({ text: "hello world", durationSeconds: 0 })

    await expect(benchmarkModel("whisper", [{ audio, reference }])).rejects.toThrow(
      `Failed to determine audio duration for ${audio}: received 0`
    )
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })
})

describe("validateAudioDuration", () => {
  it("rejects non-finite durations instead of substituting a fallback", () => {
    expect(() => validateAudioDuration("broken.wav", Number.NaN)).toThrow(
      "Failed to determine audio duration for broken.wav: received NaN"
    )
  })
})

describe("parseBenchmarkOptions", () => {
  it("derives the default output from a custom fixtures directory", () => {
    expect(parseBenchmarkOptions(["run", "--fixtures", "/tmp/custom-fixtures"], "/workspace")).toMatchObject({
      fixturesDir: "/tmp/custom-fixtures",
      outputFile: join("/tmp/custom-fixtures", "benchmark.json")
    })
  })

  it("preserves an explicit output path", () => {
    expect(
      parseBenchmarkOptions(
        ["run", "whisper", "--fixtures", "/tmp/custom-fixtures", "--output", "/tmp/result.json"],
        "/workspace"
      )
    ).toEqual({
      subcommand: "run",
      fixturesDir: "/tmp/custom-fixtures",
      outputFile: "/tmp/result.json",
      language: undefined,
      specifiedModels: ["whisper"]
    })
  })
})
