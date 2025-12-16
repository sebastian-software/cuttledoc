import { describe, expect, it } from "vitest"

import { isFFmpegAvailable } from "./audio.js"

describe("audio utils", () => {
  describe("isFFmpegAvailable", () => {
    it("should return a boolean", () => {
      const result = isFFmpegAvailable()
      expect(typeof result).toBe("boolean")
    })

    it("should be callable without throwing", () => {
      // Note: @mmomtchev/ffmpeg requires native bindings that may not be
      // built in CI environments (pnpm approve-builds). We only verify
      // the function doesn't throw, not that ffmpeg is available.
      expect(() => isFFmpegAvailable()).not.toThrow()
    })
  })

  // Note: Full integration tests for preprocessAudio require actual audio files
  // and are covered in the integration test suite
})

