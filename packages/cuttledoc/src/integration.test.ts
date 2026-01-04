import { access, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, describe, expect, it } from "vitest"

import { cleanup, transcribe, isModelDownloaded, BACKEND_TYPES } from "./index.js"

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

/**
 * Check if a fixture file exists
 */
async function fixtureExists(name: string): Promise<boolean> {
  try {
    await access(resolve(fixturesDir, name))
    return true
  } catch {
    return false
  }
}

// Check if we're on macOS (required for CoreML)
const isMacOS = process.platform === "darwin"

// Check if Parakeet model is available
let hasParakeetModel = false
if (isMacOS) {
  hasParakeetModel = await isModelDownloaded(BACKEND_TYPES.parakeet)
}

// Check if CoreML backend can be loaded
let canLoadCoreML = false
if (isMacOS && hasParakeetModel) {
  try {
    const { CoreMLBackend } = await import("./backends/coreml/index.js")
    const backend = new CoreMLBackend({ model: "parakeet" })
    await backend.initialize()
    await backend.dispose()
    canLoadCoreML = true
  } catch {
    canLoadCoreML = false
  }
}

const canRunIntegrationTests = isMacOS && hasParakeetModel && canLoadCoreML

describe("integration", () => {
  // Clean up after all tests
  afterAll(async () => {
    await cleanup()
  })

  describe("Parakeet CoreML backend", () => {
    it.skipIf(!canRunIntegrationTests)("should be available on macOS", async () => {
      const { CoreMLBackend } = await import("./backends/coreml/index.js")
      const backend = new CoreMLBackend({ model: "parakeet" })
      expect(backend.isAvailable()).toBe(true)
    })

    it.skipIf(!canRunIntegrationTests)(
      "should transcribe audio when fixtures are available",
      async () => {
        // Use bundled FLEURS samples (native speakers, ~1.7MB total)
        const hasEnglishFixture = await fixtureExists("fleurs-en-000.ogg")
        const hasEnglishReference = await fixtureExists("fleurs-en-000.txt")

        if (!hasEnglishFixture || !hasEnglishReference) {
          console.log("Skipping: No fixtures found")
          return
        }

        const audioPath = resolve(fixturesDir, "fleurs-en-000.ogg")
        const expectedText = await readFile(resolve(fixturesDir, "fleurs-en-000.txt"), "utf-8")

        const { CoreMLBackend } = await import("./backends/coreml/index.js")
        const backend = new CoreMLBackend({ model: "parakeet" })
        await backend.initialize()
        const result = await backend.transcribe(audioPath, { language: "en" })

        expect(result.text).toBeTruthy()
        expect(result.durationSeconds).toBeGreaterThan(0)
        expect(result.segments.length).toBeGreaterThan(0)
        expect(result.backend).toBe(BACKEND_TYPES.parakeet)

        // Check word overlap is high (>80% of words should match)
        const overlap = calculateWordOverlap(result.text, expectedText)
        expect(overlap).toBeGreaterThan(0.8)

        await backend.dispose()
      },
      60_000
    )
  })

  describe("transcribe function", () => {
    it.skipIf(!canRunIntegrationTests)(
      "should auto-select Parakeet backend for supported languages",
      async () => {
        // Use bundled FLEURS samples
        const hasFixture = await fixtureExists("fleurs-en-000.ogg")

        if (!hasFixture) {
          console.log("Skipping: No fixtures found")
          return
        }

        const audioPath = resolve(fixturesDir, "fleurs-en-000.ogg")

        const result = await transcribe(audioPath, { language: "en" })

        expect(result.text).toBeTruthy()
        expect(result.backend).toBe(BACKEND_TYPES.parakeet)
        expect(result.processingTimeSeconds).toBeGreaterThan(0)
      },
      60_000
    )
  })
})
