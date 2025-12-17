import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, describe, expect, it } from "vitest"

import { transcribe, cleanup } from "./index.js"
import { AppleBackend } from "./backends/apple/index.js"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const fixturesDir = resolve(__dirname, "../fixtures")

/**
 * Calculate word overlap ratio between two texts.
 * Returns a value between 0 and 1.
 */
function calculateWordOverlap(actual: string, expected: string): number {
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean)

  const actualWords = normalize(actual)
  const expectedWords = new Set(normalize(expected))

  if (actualWords.length === 0) {
    return 0
  }

  const matchingWords = actualWords.filter((word) => expectedWords.has(word))
  return matchingWords.length / actualWords.length
}

describe("integration", () => {
  // Clean up after all tests
  afterAll(async () => {
    await cleanup()
    // Also shut down Apple backend server if running
    if (process.platform === "darwin") {
      const appleBackend = new AppleBackend()
      await appleBackend.dispose()
    }
  })

  describe("Apple backend", () => {
    it.skipIf(process.platform !== "darwin")("should be available on macOS", () => {
      const backend = new AppleBackend()
      expect(backend.isAvailable()).toBe(true)
    })

    it.skipIf(process.platform !== "darwin")(
      "should transcribe short English audio",
      async () => {
        const audioPath = resolve(fixturesDir, "fairytale-en.ogg")
        const expectedText = await readFile(resolve(fixturesDir, "fairytale-en.md"), "utf-8")

        const backend = new AppleBackend()
        const result = await backend.transcribe(audioPath, { language: "en-US" })

        expect(result.text).toBeTruthy()
        expect(result.durationSeconds).toBeGreaterThan(0)
        expect(result.segments.length).toBeGreaterThan(0)
        expect(result.backend).toBe("apple")

        // Check word overlap is reasonable (>40% of words should match)
        const overlap = calculateWordOverlap(result.text, expectedText)
        expect(overlap).toBeGreaterThan(0.4)
      },
      60_000
    )

    it.skipIf(process.platform !== "darwin")(
      "should transcribe short German audio",
      async () => {
        const audioPath = resolve(fixturesDir, "fairytale-de.ogg")
        const expectedText = await readFile(resolve(fixturesDir, "fairytale-de.md"), "utf-8")

        const backend = new AppleBackend()
        const result = await backend.transcribe(audioPath, { language: "de-DE" })

        expect(result.text).toBeTruthy()
        expect(result.durationSeconds).toBeGreaterThan(0)
        expect(result.segments.length).toBeGreaterThan(0)

        // Check word overlap (German TTS may have lower accuracy)
        const overlap = calculateWordOverlap(result.text, expectedText)
        expect(overlap).toBeGreaterThan(0.3)
      },
      60_000
    )
  })

  describe("transcribe function", () => {
    it.skipIf(process.platform !== "darwin")(
      "should auto-select Apple backend on macOS",
      async () => {
        const audioPath = resolve(fixturesDir, "fairytale-en.ogg")

        const result = await transcribe(audioPath, { language: "en-US" })

        expect(result.text).toBeTruthy()
        expect(result.backend).toBe("apple")
        expect(result.processingTimeSeconds).toBeGreaterThan(0)
      },
      60_000
    )

    it.skipIf(process.platform !== "darwin")(
      "should return segment timing information",
      async () => {
        const audioPath = resolve(fixturesDir, "fairytale-en.ogg")

        const result = await transcribe(audioPath, { language: "en-US" })

        // Should have segments
        expect(result.segments.length).toBeGreaterThan(0)

        // Segments should have valid timing
        for (const segment of result.segments) {
          expect(segment.startSeconds).toBeGreaterThanOrEqual(0)
          expect(segment.endSeconds).toBeGreaterThan(segment.startSeconds)
          expect(segment.text).toBeTruthy()
          expect(segment.confidence).toBeGreaterThanOrEqual(0)
          expect(segment.confidence).toBeLessThanOrEqual(1)
        }
      },
      60_000
    )
  })
})
