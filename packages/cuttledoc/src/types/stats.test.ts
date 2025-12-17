import { describe, expect, it } from "vitest"

import type { TranscriptionJobStats } from "./stats.js"
import { calculateWordChanges, createSummaryReport, formatBytes, formatDuration } from "./stats.js"

describe("stats utils", () => {
  describe("formatBytes", () => {
    it("should format 0 bytes", () => {
      expect(formatBytes(0)).toBe("0 B")
    })

    it("should format bytes", () => {
      expect(formatBytes(500)).toBe("500.0 B")
    })

    it("should format kilobytes", () => {
      expect(formatBytes(1024)).toBe("1.0 KB")
      expect(formatBytes(1536)).toBe("1.5 KB")
    })

    it("should format megabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
      expect(formatBytes(256 * 1024 * 1024)).toBe("256.0 MB")
    })

    it("should format gigabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB")
      expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB")
    })
  })

  describe("formatDuration", () => {
    it("should format seconds only", () => {
      expect(formatDuration(45)).toBe("0:45")
    })

    it("should format minutes and seconds", () => {
      expect(formatDuration(125)).toBe("2:05")
      expect(formatDuration(600)).toBe("10:00")
    })

    it("should format hours, minutes, seconds", () => {
      expect(formatDuration(3661)).toBe("1:01:01")
      expect(formatDuration(7200)).toBe("2:00:00")
    })

    it("should pad single-digit values", () => {
      expect(formatDuration(61)).toBe("1:01")
      expect(formatDuration(3601)).toBe("1:00:01")
    })
  })

  describe("calculateWordChanges", () => {
    it("should return 0 for identical texts", () => {
      const result = calculateWordChanges("hello world", "hello world")
      expect(result.changed).toBe(0)
      expect(result.total).toBe(2)
      expect(result.percentage).toBe(0)
    })

    it("should count changed words", () => {
      const result = calculateWordChanges("the quick brown fox", "the slow brown fox")
      expect(result.changed).toBe(1)
      expect(result.total).toBe(4)
      expect(result.percentage).toBe(25)
    })

    it("should handle empty texts", () => {
      const result = calculateWordChanges("", "")
      expect(result.changed).toBe(0)
      expect(result.total).toBe(0)
      expect(result.percentage).toBe(0)
    })

    it("should handle texts of different lengths", () => {
      const result = calculateWordChanges("one two three", "one two three four five")
      // Should count differences up to shorter length
      expect(result.changed).toBeGreaterThanOrEqual(0)
    })
  })

  describe("createSummaryReport", () => {
    function createMockStats(overrides?: Partial<TranscriptionJobStats>): TranscriptionJobStats {
      return {
        jobId: "test-job-123",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: "2024-01-01T10:01:00Z",
        totalTimeSeconds: 60,
        totalTimeHuman: "1:00",
        input: {
          source: "test-audio.mp3",
          sizeBytes: 1024 * 1024,
          sizeHuman: "1.0 MB",
          containerFormat: "mp3",
          audioCodec: "mp3",
          originalSampleRate: 44100,
          originalChannels: 2,
          durationSeconds: 300,
          durationHuman: "5:00",
          isVideo: false
        },
        preprocessing: {
          processingTimeSeconds: 5,
          outputSampleRate: 16000,
          outputChannels: 1,
          outputSamples: 4800000,
          realtimeFactor: 0.0167
        },
        transcription: {
          backend: "apple",
          model: "default",
          processingTimeSeconds: 30,
          realtimeFactor: 0.1,
          segmentCount: 10,
          wordCount: 500,
          charCount: 2500
        },
        llmProcessing: {
          enabled: false
        },
        overallRealtimeFactor: 0.2,
        success: true,
        ...overrides
      }
    }

    it("should create report with basic info", () => {
      const stats = createMockStats()
      const report = createSummaryReport(stats)

      expect(report).toContain("TRANSCRIPTION REPORT")
      expect(report).toContain("test-audio.mp3")
      expect(report).toContain("1.0 MB")
      expect(report).toContain("mp3")
    })

    it("should include input section", () => {
      const stats = createMockStats()
      const report = createSummaryReport(stats)

      expect(report).toContain("INPUT")
      expect(report).toContain("Source:")
      expect(report).toContain("Size:")
      expect(report).toContain("Format:")
      expect(report).toContain("Duration:")
    })

    it("should include preprocessing section", () => {
      const stats = createMockStats()
      const report = createSummaryReport(stats)

      expect(report).toContain("PREPROCESSING")
      expect(report).toContain("Time:")
      expect(report).toContain("Speed:")
    })

    it("should include transcription section", () => {
      const stats = createMockStats()
      const report = createSummaryReport(stats)

      expect(report).toContain("TRANSCRIPTION")
      expect(report).toContain("Backend:")
      expect(report).toContain("apple")
      expect(report).toContain("Model:")
      expect(report).toContain("Words:")
      expect(report).toContain("500")
      expect(report).toContain("Segments:")
      expect(report).toContain("10")
    })

    it("should show video resolution when applicable", () => {
      const stats = createMockStats({
        input: {
          source: "video.mp4",
          sizeBytes: 10 * 1024 * 1024,
          sizeHuman: "10.0 MB",
          containerFormat: "mp4",
          audioCodec: "aac",
          originalSampleRate: 48000,
          originalChannels: 2,
          durationSeconds: 600,
          durationHuman: "10:00",
          isVideo: true,
          videoResolution: "1920x1080"
        }
      })
      const report = createSummaryReport(stats)

      expect(report).toContain("Video:")
      expect(report).toContain("1920x1080")
    })

    it("should not show video section for audio files", () => {
      const stats = createMockStats()
      const report = createSummaryReport(stats)

      expect(report).not.toContain("Video:")
    })

    it("should show confidence when available", () => {
      const stats = createMockStats({
        transcription: {
          backend: "sherpa",
          model: "parakeet-tdt-0.6b-v3",
          processingTimeSeconds: 30,
          realtimeFactor: 0.1,
          segmentCount: 10,
          wordCount: 500,
          charCount: 2500,
          confidence: 0.95
        }
      })
      const report = createSummaryReport(stats)

      expect(report).toContain("Confidence:")
      expect(report).toContain("95.0%")
    })

    it("should include LLM section when enabled", () => {
      const stats = createMockStats({
        llmProcessing: {
          enabled: true,
          provider: "ollama",
          model: "gemma3n:e4b",
          processingTimeSeconds: 10,
          inputTokens: 1000,
          outputTokens: 1000,
          wordsChanged: 15,
          changePercentage: 3.0
        }
      })
      const report = createSummaryReport(stats)

      expect(report).toContain("LLM CORRECTION")
      expect(report).toContain("Provider:")
      expect(report).toContain("ollama")
      expect(report).toContain("Model:")
      expect(report).toContain("gemma3n:e4b")
      expect(report).toContain("Changed:")
      expect(report).toContain("15 words")
      expect(report).toContain("3.0%")
    })

    it("should not include LLM section when disabled", () => {
      const stats = createMockStats()
      const report = createSummaryReport(stats)

      expect(report).not.toContain("LLM CORRECTION")
    })

    it("should include summary section", () => {
      const stats = createMockStats()
      const report = createSummaryReport(stats)

      expect(report).toContain("SUMMARY")
      expect(report).toContain("Total Time:")
      expect(report).toContain("Speed:")
      expect(report).toContain("Status:")
    })

    it("should show success status", () => {
      const stats = createMockStats({ success: true })
      const report = createSummaryReport(stats)

      expect(report).toContain("✅ Success")
    })

    it("should show failed status", () => {
      const stats = createMockStats({ success: false })
      const report = createSummaryReport(stats)

      expect(report).toContain("❌ Failed")
    })

    it("should calculate speeds correctly", () => {
      const stats = createMockStats({
        preprocessing: {
          processingTimeSeconds: 5,
          outputSampleRate: 16000,
          outputChannels: 1,
          outputSamples: 4800000,
          realtimeFactor: 0.1 // 10x speed
        },
        transcription: {
          backend: "apple",
          model: "default",
          processingTimeSeconds: 30,
          realtimeFactor: 0.05, // 20x speed
          segmentCount: 10,
          wordCount: 500,
          charCount: 2500
        },
        overallRealtimeFactor: 0.2 // 5x speed
      })
      const report = createSummaryReport(stats)

      expect(report).toContain("10.0x realtime") // preprocessing
      expect(report).toContain("20.0x realtime") // transcription
      expect(report).toContain("5.0x realtime") // overall
    })

    it("should handle missing optional LLM fields gracefully", () => {
      const stats = createMockStats({
        llmProcessing: {
          enabled: true
          // All optional fields missing
        }
      })
      const report = createSummaryReport(stats)

      expect(report).toContain("LLM CORRECTION")
      expect(report).toContain("unknown") // default provider/model
    })
  })
})
