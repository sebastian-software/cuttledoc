import { afterEach, describe, expect, it, vi } from "vitest"

import { getAvailableBackends, getBackend, selectBestBackend, setBackend } from "./backend.js"
import { BACKEND_TYPES } from "./types.js"

// Mock os.platform
vi.mock("node:os", () => ({
  platform: vi.fn(() => "darwin")
}))

describe("backend", () => {
  afterEach(() => {
    // Reset to auto after each test
    setBackend(BACKEND_TYPES.auto)
  })

  describe("setBackend/getBackend", () => {
    it("should default to auto", () => {
      expect(getBackend()).toBe(BACKEND_TYPES.auto)
    })

    it("should set and get apple backend", () => {
      setBackend(BACKEND_TYPES.apple)
      expect(getBackend()).toBe(BACKEND_TYPES.apple)
    })

    it("should set and get parakeet backend", () => {
      setBackend(BACKEND_TYPES.parakeet)
      expect(getBackend()).toBe(BACKEND_TYPES.parakeet)
    })

    it("should set and get whisper backend", () => {
      setBackend(BACKEND_TYPES.whisper)
      expect(getBackend()).toBe(BACKEND_TYPES.whisper)
    })

    it("should set and get canary backend", () => {
      setBackend(BACKEND_TYPES.canary)
      expect(getBackend()).toBe(BACKEND_TYPES.canary)
    })
  })

  describe("getAvailableBackends", () => {
    it("should return an array of backends", () => {
      const backends = getAvailableBackends()
      expect(Array.isArray(backends)).toBe(true)
      expect(backends.length).toBeGreaterThan(0)
    })

    it("should include apple backend on macOS", async () => {
      const os = await import("node:os")
      vi.mocked(os.platform).mockReturnValue("darwin")

      const backends = getAvailableBackends()
      const appleBackend = backends.find((b) => b.name === BACKEND_TYPES.apple)
      expect(appleBackend).toBeDefined()
      expect(appleBackend?.isAvailable).toBe(true)
      expect(appleBackend?.requiresDownload).toBe(false)
    })

    it("should always include parakeet backend", () => {
      const backends = getAvailableBackends()
      const parakeetBackend = backends.find((b) => b.name === BACKEND_TYPES.parakeet)
      expect(parakeetBackend).toBeDefined()
      expect(parakeetBackend?.isAvailable).toBe(true)
      expect(parakeetBackend?.requiresDownload).toBe(true)
    })

    it("should always include canary backend", () => {
      const backends = getAvailableBackends()
      const canaryBackend = backends.find((b) => b.name === BACKEND_TYPES.canary)
      expect(canaryBackend).toBeDefined()
      expect(canaryBackend?.isAvailable).toBe(true)
      expect(canaryBackend?.requiresDownload).toBe(true)
    })

    it("should always include whisper backend", () => {
      const backends = getAvailableBackends()
      const whisperBackend = backends.find((b) => b.name === BACKEND_TYPES.whisper)
      expect(whisperBackend).toBeDefined()
      expect(whisperBackend?.isAvailable).toBe(true)
      expect(whisperBackend?.requiresDownload).toBe(true)
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
    it("should select apple on macOS", async () => {
      const os = await import("node:os")
      vi.mocked(os.platform).mockReturnValue("darwin")

      const backend = selectBestBackend()
      expect(backend).toBe(BACKEND_TYPES.apple)
    })

    it("should select apple on macOS regardless of language", async () => {
      const os = await import("node:os")
      vi.mocked(os.platform).mockReturnValue("darwin")

      expect(selectBestBackend("de")).toBe(BACKEND_TYPES.apple)
      expect(selectBestBackend("ja")).toBe(BACKEND_TYPES.apple)
      expect(selectBestBackend("zh")).toBe(BACKEND_TYPES.apple)
    })

    it("should select parakeet for EU languages on non-macOS", async () => {
      const os = await import("node:os")
      vi.mocked(os.platform).mockReturnValue("linux")

      expect(selectBestBackend("de")).toBe(BACKEND_TYPES.parakeet)
      expect(selectBestBackend("en")).toBe(BACKEND_TYPES.parakeet)
      expect(selectBestBackend("fr")).toBe(BACKEND_TYPES.parakeet)
      expect(selectBestBackend("es")).toBe(BACKEND_TYPES.parakeet)
    })

    it("should select parakeet when no language specified on non-macOS", async () => {
      const os = await import("node:os")
      vi.mocked(os.platform).mockReturnValue("linux")

      const backend = selectBestBackend()
      expect(backend).toBe(BACKEND_TYPES.parakeet)
    })

    it("should select whisper for non-EU languages on non-macOS", async () => {
      const os = await import("node:os")
      vi.mocked(os.platform).mockReturnValue("linux")

      expect(selectBestBackend("ja")).toBe(BACKEND_TYPES.whisper)
      expect(selectBestBackend("zh")).toBe(BACKEND_TYPES.whisper)
      expect(selectBestBackend("ar")).toBe(BACKEND_TYPES.whisper)
    })

    it("should handle language codes with region", async () => {
      const os = await import("node:os")
      vi.mocked(os.platform).mockReturnValue("linux")

      expect(selectBestBackend("en-US")).toBe(BACKEND_TYPES.parakeet)
      expect(selectBestBackend("de-DE")).toBe(BACKEND_TYPES.parakeet)
      expect(selectBestBackend("ja-JP")).toBe(BACKEND_TYPES.whisper)
    })
  })
})
