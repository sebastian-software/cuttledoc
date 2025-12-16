import { describe, expect, it } from "vitest";

import { isFFmpegAvailable } from "./audio.js";

describe("audio utils", () => {
  describe("isFFmpegAvailable", () => {
    it("should return a boolean", () => {
      const result = isFFmpegAvailable();
      expect(typeof result).toBe("boolean");
    });

    it("should return true when @mmomtchev/ffmpeg is installed", () => {
      // In our test environment, ffmpeg should be installed
      const result = isFFmpegAvailable();
      expect(result).toBe(true);
    });
  });

  // Note: Full integration tests for preprocessAudio require actual audio files
  // and are covered in the integration test suite
});

