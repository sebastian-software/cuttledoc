import { afterEach, describe, expect, it, vi } from "vitest"

import { getAvailableBackends, getBackend, selectBestBackend, setBackend } from "./backend.js"
import { BACKEND_TYPES } from "./types.js"

describe("backend", () => {
  afterEach(() => {
    // Reset to auto after each test
    setBackend(BACKEND_TYPES.auto)
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("setBackend/getBackend", () => {
    it("should default to auto", () => {
      expect(getBackend()).toBe(BACKEND_TYPES.auto)
    })

    it("should set and get parakeet backend", () => {
      setBackend(BACKEND_TYPES.parakeet)
      expect(getBackend()).toBe(BACKEND_TYPES.parakeet)
    })

    it("should set and get whisper backend", () => {
      setBackend(BACKEND_TYPES.whisper)
      expect(getBackend()).toBe(BACKEND_TYPES.whisper)
    })
  })

  describe("getAvailableBackends", () => {
    it("should return an array of backends", () => {
      const backends = getAvailableBackends()
      expect(Array.isArray(backends)).toBe(true)
      expect(backends.length).toBeGreaterThan(0)
    })

    it("should include parakeet with platform availability", () => {
      const backends = getAvailableBackends()
      const parakeetBackend = backends.find((b) => b.name === BACKEND_TYPES.parakeet)
      expect(parakeetBackend).toBeDefined()
      expect(parakeetBackend?.isAvailable).toBe(process.platform === "darwin")
      expect(parakeetBackend?.requiresDownload).toBe(true)
    })

    it("should include whisper with platform availability", () => {
      const backends = getAvailableBackends()
      const whisperBackend = backends.find((b) => b.name === BACKEND_TYPES.whisper)
      expect(whisperBackend).toBeDefined()
      expect(whisperBackend?.isAvailable).toBe(process.platform === "darwin")
      expect(whisperBackend?.requiresDownload).toBe(true)
      expect(whisperBackend?.models).toEqual(["large-v3-turbo"])
    })

    it("should have languages for each backend", () => {
      const backends = getAvailableBackends()
      for (const backend of backends) {
        expect(backend.languages.length).toBeGreaterThan(0)
      }
    })

    it("should have models for each backend", () => {
      const backends = getAvailableBackends()
      for (const backend of backends) {
        expect(backend.models.length).toBeGreaterThan(0)
      }
    })
  })

  describe("selectBestBackend", () => {
    function setPlatform(platform: NodeJS.Platform): void {
      vi.spyOn(process, "platform", "get").mockReturnValue(platform)
    }

    it("should select parakeet for supported languages", () => {
      setPlatform("darwin")
      expect(selectBestBackend("de")).toBe(BACKEND_TYPES.parakeet)
      expect(selectBestBackend("en")).toBe(BACKEND_TYPES.parakeet)
      expect(selectBestBackend("fr")).toBe(BACKEND_TYPES.parakeet)
      expect(selectBestBackend("es")).toBe(BACKEND_TYPES.parakeet)
    })

    it("should select parakeet when no language specified", () => {
      setPlatform("darwin")
      const backend = selectBestBackend()
      expect(backend).toBe(BACKEND_TYPES.parakeet)
    })

    it("should select whisper for unsupported languages", () => {
      setPlatform("darwin")
      expect(selectBestBackend("ja")).toBe(BACKEND_TYPES.whisper)
      expect(selectBestBackend("zh")).toBe(BACKEND_TYPES.whisper)
      expect(selectBestBackend("ar")).toBe(BACKEND_TYPES.whisper)
    })

    it("should handle language codes with region", () => {
      setPlatform("darwin")
      expect(selectBestBackend("en-US")).toBe(BACKEND_TYPES.parakeet)
      expect(selectBestBackend("de-DE")).toBe(BACKEND_TYPES.parakeet)
      expect(selectBestBackend("ja-JP")).toBe(BACKEND_TYPES.whisper)
    })

    it.each(["linux", "win32"] as const)("should select OpenAI on %s when an API key is provided", (platform) => {
      setPlatform(platform)

      expect(selectBestBackend("de", "test-key")).toBe(BACKEND_TYPES.openai)
      expect(selectBestBackend("ja", "test-key")).toBe(BACKEND_TYPES.openai)
    })

    it("should use OPENAI_API_KEY for non-macOS auto selection", () => {
      setPlatform("linux")
      vi.stubEnv("OPENAI_API_KEY", "environment-key")

      expect(selectBestBackend("de")).toBe(BACKEND_TYPES.openai)
      expect(selectBestBackend("de", "")).toBe(BACKEND_TYPES.openai)
    })

    it.each(["linux", "win32"] as const)("should fail actionably on %s without an API key", (platform) => {
      setPlatform(platform)
      vi.stubEnv("OPENAI_API_KEY", "")

      expect(() => selectBestBackend("de")).toThrow(
        'Set OPENAI_API_KEY or provide options.apiKey, then use backend "openai" (CLI: -b openai).'
      )
    })
  })
})
