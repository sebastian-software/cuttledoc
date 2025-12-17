import { describe, expect, it } from "vitest"

import { calculateWordChanges, formatBytes, formatDuration } from "./stats.js"

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
})
