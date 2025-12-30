import { access, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, describe, expect, it } from "vitest"

import { isModelDownloaded } from "./backends/sherpa/download.js"

import { cleanup, transcribe, BACKEND_TYPES } from "./index.js"

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

// Check if Parakeet model is available and sherpa-onnx can be loaded
const hasParakeetModel = isModelDownloaded("parakeet-tdt-0.6b-v3")

// Check if sherpa-onnx-node can be loaded (may fail due to pnpm path issues)
let canLoadSherpa = false
try {
  const { SherpaBackend } = await import("./backends/sherpa/index.js")
  const backend = new SherpaBackend({ model: "parakeet-tdt-0.6b-v3" })
  await backend.initialize()
  await backend.dispose()
  canLoadSherpa = true
} catch {
  // sherpa-onnx-node failed to load (pnpm path issues)
  canLoadSherpa = false
}

const canRunIntegrationTests = hasParakeetModel && canLoadSherpa

describe("integration", () => {
  // Clean up after all tests
  afterAll(async () => {
    await cleanup()
  })

  describe("Parakeet backend", () => {
    it.skipIf(!canRunIntegrationTests)("should be available when model is downloaded", async () => {
      const { SherpaBackend } = await import("./backends/sherpa/index.js")
      const backend = new SherpaBackend({ model: "parakeet-tdt-0.6b-v3" })
      expect(backend.isAvailable()).toBe(true)
    })

    it.skipIf(!canRunIntegrationTests)(
      "should transcribe audio when fixtures are available",
      async () => {
        // Skip if no fixtures are available
        // Users should add their own test audio from FLEURS or other datasets
        const hasEnglishFixture = await fixtureExists("test-en.ogg")
        const hasEnglishReference = await fixtureExists("test-en.md")

        if (!hasEnglishFixture || !hasEnglishReference) {
          console.log("Skipping: No test fixtures found. See fixtures/README.md for setup instructions.")
          return
        }

        const audioPath = resolve(fixturesDir, "test-en.ogg")
        const expectedText = await readFile(resolve(fixturesDir, "test-en.md"), "utf-8")

        const { SherpaBackend } = await import("./backends/sherpa/index.js")
        const backend = new SherpaBackend({ model: "parakeet-tdt-0.6b-v3" })
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
        // Skip if no fixtures are available
        const hasFixture = await fixtureExists("test-en.ogg")

        if (!hasFixture) {
          console.log("Skipping: No test fixtures found. See fixtures/README.md for setup instructions.")
          return
        }

        const audioPath = resolve(fixturesDir, "test-en.ogg")

        const result = await transcribe(audioPath, { language: "en" })

        expect(result.text).toBeTruthy()
        expect(result.backend).toBe(BACKEND_TYPES.parakeet)
        expect(result.processingTimeSeconds).toBeGreaterThan(0)
      },
      60_000
    )
  })
})
