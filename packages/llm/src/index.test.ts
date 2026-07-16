import { afterEach, describe, expect, it, vi } from "vitest"

import { enhanceTranscript } from "./index.js"

const longTranscript = Array.from({ length: 2001 }, (_, index) => `word${String(index)}`).join(" ")

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("enhanceTranscript", () => {
  it("chunks long Ollama transcripts through the public API", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ response: "enhanced", done: true, eval_count: 1, eval_duration: 1_000_000_000 })
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await enhanceTranscript(longTranscript, { provider: "ollama", model: "test-model" })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("chunks long OpenAI transcripts through the public API", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "enhanced" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
          })
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await enhanceTranscript(longTranscript, {
      provider: "openai",
      model: "test-model",
      apiKey: "test-key"
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
