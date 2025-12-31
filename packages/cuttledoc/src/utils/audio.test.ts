import { describe, expect, it } from "vitest"

import { isFFmpegAvailable, normalizeAudio } from "./audio.js"

describe("audio utils", () => {
  describe("isFFmpegAvailable", () => {
    it("should return a boolean", () => {
      const result = isFFmpegAvailable()
      expect(typeof result).toBe("boolean")
    })

    it("should be callable without throwing", () => {
      // Checks if system ffmpeg is installed
      expect(() => isFFmpegAvailable()).not.toThrow()
    })

    it("should return true when ffmpeg is installed", () => {
      // ffmpeg is typically available in development environments
      // This test verifies the detection works
      const result = isFFmpegAvailable()
      // On most dev machines ffmpeg is installed
      expect(result).toBe(true)
    })
  })

  describe("normalizeAudio", () => {
    it("should boost quiet audio", () => {
      // Very quiet audio (peak at 0.1)
      const quiet = new Float32Array([0.05, 0.1, -0.05, 0.08])
      const normalized = normalizeAudio(quiet)

      // Should be louder now
      expect(Math.max(...normalized)).toBeGreaterThan(0.5)
    })

    it("should not modify loud audio", () => {
      // Already loud audio (peak at 0.8)
      const loud = new Float32Array([0.4, 0.8, -0.6, 0.5])
      const normalized = normalizeAudio(loud)

      // Should be the same array reference (no copy needed)
      expect(normalized).toBe(loud)
    })

    it("should handle silent audio", () => {
      const silent = new Float32Array([0, 0, 0, 0])
      const normalized = normalizeAudio(silent)

      // Should return same silent array
      expect(normalized).toBe(silent)
    })
  })

  // Note: Full integration tests for preprocessAudio require actual audio files
  // and are covered in the integration test suite
})
