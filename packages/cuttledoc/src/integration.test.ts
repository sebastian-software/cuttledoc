import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { transcribe } from "./index.js"

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
  describe("transcribe fixtures", () => {
    it.skipIf(process.platform !== "darwin")(
      "should transcribe German audio",
      async () => {
        const audioPath = resolve(fixturesDir, "teleportation-de.ogg")
        const expectedText = await readFile(resolve(fixturesDir, "teleportation-de.md"), "utf-8")

        const result = await transcribe(audioPath, { language: "de-DE" })

        expect(result.text).toBeTruthy()
        expect(result.durationSeconds).toBeGreaterThan(0)
        expect(result.segments.length).toBeGreaterThan(0)

        // Check word overlap is reasonable (>50% of words should match)
        const overlap = calculateWordOverlap(result.text, expectedText)
        expect(overlap).toBeGreaterThan(0.5)
      },
      120_000
    )

    it.skipIf(process.platform !== "darwin")(
      "should transcribe English audio",
      async () => {
        const audioPath = resolve(fixturesDir, "teleportation-en.ogg")
        const expectedText = await readFile(resolve(fixturesDir, "teleportation-en.md"), "utf-8")

        const result = await transcribe(audioPath, { language: "en-US" })

        expect(result.text).toBeTruthy()
        expect(result.durationSeconds).toBeGreaterThan(0)
        expect(result.segments.length).toBeGreaterThan(0)

        // Check word overlap is reasonable (>50% of words should match)
        const overlap = calculateWordOverlap(result.text, expectedText)
        expect(overlap).toBeGreaterThan(0.5)
      },
      120_000
    )

    it.skipIf(process.platform !== "darwin")(
      "should return timing information",
      async () => {
        const audioPath = resolve(fixturesDir, "teleportation-en.ogg")

        const result = await transcribe(audioPath, { language: "en-US" })

        // Should have processing time
        expect(result.processingTimeSeconds).toBeGreaterThan(0)

        // Segments should have timing
        for (const segment of result.segments) {
          expect(segment.startSeconds).toBeGreaterThanOrEqual(0)
          expect(segment.endSeconds).toBeGreaterThan(segment.startSeconds)
        }
      },
      120_000
    )
  })
})
