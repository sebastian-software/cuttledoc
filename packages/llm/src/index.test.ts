import { afterEach, describe, expect, it, vi } from "vitest"

import { enhanceTranscript } from "./index.js"

const longTranscript = Array.from({ length: 2001 }, (_, index) => `word${String(index)}`).join(" ")

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("enhanceTranscript", () => {
  it("auto-detects OpenAI after Ollama is unavailable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "environment-key")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: "enhanced" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      )
    vi.stubGlobal("fetch", fetchMock)

    const result = await enhanceTranscript("raw transcript")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toEqual(expect.stringMatching(/\/api\/tags$/))
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(expect.stringMatching(/\/chat\/completions$/))
    expect(result.stats.provider).toBe("openai")
  })

  it("chunks long Ollama transcripts through the public API", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: "enhanced", done: true, eval_count: 1, eval_duration: 1_000_000_000 })
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
