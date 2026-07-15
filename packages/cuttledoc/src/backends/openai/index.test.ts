import { afterEach, describe, expect, it, vi } from "vitest"

import { OpenAIBackend } from "./index.js"

describe("OpenAIBackend credentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("falls back to OPENAI_API_KEY when the option is blank", () => {
    vi.stubEnv("OPENAI_API_KEY", "environment-key")

    const backend = new OpenAIBackend({ apiKey: "" })

    expect(backend.isAvailable()).toBe(true)
  })

  it("is unavailable when neither option nor environment contains a key", () => {
    vi.stubEnv("OPENAI_API_KEY", "")

    const backend = new OpenAIBackend({ apiKey: "" })

    expect(backend.isAvailable()).toBe(false)
  })
})
