import { beforeEach, describe, expect, it, vi } from "vitest"

import { printHelp, printModels, printStats, printVersion } from "./output.js"

// Mock console.log
const mockConsoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined)

describe("cli output", () => {
  beforeEach(() => {
    mockConsoleLog.mockClear()
  })

  describe("printHelp", () => {
    it("should print help message", () => {
      printHelp()

      expect(mockConsoleLog).toHaveBeenCalled()
      const output = mockConsoleLog.mock.calls[0]?.[0] as string
      expect(output).toContain("cuttledoc")
      expect(output).toContain("USAGE")
      expect(output).toContain("OPTIONS")
      expect(output).toContain("EXAMPLES")
    })

    it("should document backend option", () => {
      printHelp()

      const output = mockConsoleLog.mock.calls[0]?.[0] as string
      expect(output).toContain("--backend")
      expect(output).toContain("-b")
    })

    it("should document language option", () => {
      printHelp()

      const output = mockConsoleLog.mock.calls[0]?.[0] as string
      expect(output).toContain("--language")
      expect(output).toContain("-l")
    })

    it("should document enhance option", () => {
      printHelp()

      const output = mockConsoleLog.mock.calls[0]?.[0] as string
      expect(output).toContain("--enhance")
      expect(output).toContain("-e")
    })

    it("should document models command", () => {
      printHelp()

      const output = mockConsoleLog.mock.calls[0]?.[0] as string
      expect(output).toContain("models")
      expect(output).toContain("download")
    })
  })

  describe("printVersion", () => {
    it("should print version", () => {
      printVersion()

      expect(mockConsoleLog).toHaveBeenCalledWith("cuttledoc v0.1.0")
    })
  })

  describe("printModels", () => {
    it("should print speech and LLM models", () => {
      const sherpaModels = {
        "model-1": { description: "Test model 1" },
        "model-2": { description: "Test model 2" }
      }
      const llmModels = {
        "llm-1": { description: "LLM model 1" },
        "llm-2": { description: "LLM model 2" }
      }

      printModels(
        sherpaModels,
        llmModels,
        () => false,
        () => false
      )

      // Should have multiple log calls for different sections
      expect(mockConsoleLog).toHaveBeenCalled()
      const allCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join("\n")
      expect(allCalls).toContain("SPEECH MODELS")
      expect(allCalls).toContain("LLM MODELS")
      expect(allCalls).toContain("model-1")
      expect(allCalls).toContain("model-2")
      expect(allCalls).toContain("llm-1")
      expect(allCalls).toContain("llm-2")
    })

    it("should show checkmark for downloaded models", () => {
      const sherpaModels = {
        downloaded: { description: "Downloaded model" },
        "not-downloaded": { description: "Not downloaded" }
      }
      const llmModels = {
        "llm-downloaded": { description: "LLM downloaded" }
      }

      printModels(
        sherpaModels,
        llmModels,
        (id) => id === "downloaded",
        (id) => id === "llm-downloaded"
      )

      const allCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join("\n")
      expect(allCalls).toContain("✅")
    })

    it("should show download instructions", () => {
      printModels(
        {},
        {},
        () => false,
        () => false
      )

      const allCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join("\n")
      expect(allCalls).toContain("To download a model")
      expect(allCalls).toContain("cuttledoc models download")
    })
  })

  describe("printStats", () => {
    it("should print basic statistics", () => {
      printStats({
        inputFile: "test.mp3",
        durationSeconds: 60,
        transcribeTimeSeconds: 6,
        totalTimeSeconds: 10,
        backend: "apple",
        wordCount: 100,
        enhanced: false
      })

      const allCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join("\n")
      expect(allCalls).toContain("STATISTICS")
      expect(allCalls).toContain("test.mp3")
      expect(allCalls).toContain("apple")
      expect(allCalls).toContain("100")
    })

    it("should show realtime factor", () => {
      printStats({
        inputFile: "test.mp3",
        durationSeconds: 60,
        transcribeTimeSeconds: 6,
        totalTimeSeconds: 6,
        backend: "apple",
        wordCount: 100,
        enhanced: false
      })

      const allCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join("\n")
      expect(allCalls).toContain("10.0x realtime") // 60/6 = 10
    })

    it("should show total time with LLM when enhanced", () => {
      printStats({
        inputFile: "test.mp3",
        durationSeconds: 60,
        transcribeTimeSeconds: 6,
        totalTimeSeconds: 15,
        backend: "sherpa",
        wordCount: 100,
        enhanced: true
      })

      const allCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join("\n")
      expect(allCalls).toContain("15.0s (with LLM)")
    })

    it("should not show total time when not enhanced", () => {
      printStats({
        inputFile: "test.mp3",
        durationSeconds: 60,
        transcribeTimeSeconds: 6,
        totalTimeSeconds: 6,
        backend: "apple",
        wordCount: 100,
        enhanced: false
      })

      const allCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join("\n")
      expect(allCalls).not.toContain("with LLM")
    })

    it("should format duration correctly", () => {
      printStats({
        inputFile: "test.mp3",
        durationSeconds: 3661, // 1:01:01
        transcribeTimeSeconds: 100,
        totalTimeSeconds: 100,
        backend: "apple",
        wordCount: 1000,
        enhanced: false
      })

      const allCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join("\n")
      expect(allCalls).toContain("1:01:01")
    })

    it("should format short duration correctly", () => {
      printStats({
        inputFile: "test.mp3",
        durationSeconds: 65, // 1:05
        transcribeTimeSeconds: 6.5,
        totalTimeSeconds: 6.5,
        backend: "apple",
        wordCount: 50,
        enhanced: false
      })

      const allCalls = mockConsoleLog.mock.calls.map((c) => c[0]).join("\n")
      expect(allCalls).toContain("1:05")
    })
  })
})
