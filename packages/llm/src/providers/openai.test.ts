import { afterEach, describe, expect, it, vi } from "vitest"

import { hasOpenAIKey, OpenAIProcessor } from "./openai.js"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("OpenAI credentials", () => {
  it("requires a non-empty API key", () => {
    vi.stubEnv("OPENAI_API_KEY", "")

    expect(hasOpenAIKey()).toBe(false)
    expect(() => new OpenAIProcessor()).toThrow("OpenAI API key is required")

    vi.stubEnv("OPENAI_API_KEY", "environment-key")
    expect(hasOpenAIKey()).toBe(true)
    expect(new OpenAIProcessor().isAvailable()).toBe(true)
  })
})

describe("OpenAIProcessor", () => {
  it("sends an authenticated chat request and maps usage statistics", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(2_000).mockReturnValueOnce(4_000)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "chatcmpl-test",
        choices: [{ message: { content: "**Hello world.**" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await new OpenAIProcessor({ model: "test-model", apiKey: "test-key" }).enhance("hello world", {
      mode: "format",
      temperature: 0.6
    })

    const request = fetchMock.mock.calls[0]
    expect(request?.[0]).toEqual(expect.stringMatching(/\/chat\/completions$/))
    expect(request?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-key"
      }
    })
    const requestBody = request?.[1]?.body
    if (typeof requestBody !== "string") {
      throw new TypeError("Expected a string request body")
    }
    expect(JSON.parse(requestBody)).toMatchObject({
      model: "test-model",
      messages: [{ role: "system" }, { role: "user", content: "hello world" }],
      temperature: 0.6
    })
    expect(result).toMatchObject({
      markdown: "**Hello world.**",
      plainText: "Hello world.",
      stats: {
        processingTimeSeconds: 2,
        inputTokens: 12,
        outputTokens: 8,
        tokensPerSecond: 4,
        provider: "openai",
        model: "test-model"
      }
    })
  })

  it("includes the API response body in request failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("quota exceeded", { status: 429, statusText: "Too Many Requests" }))
    )

    await expect(new OpenAIProcessor({ apiKey: "test-key" }).enhance("hello")).rejects.toThrow(
      "OpenAI API error: 429 Too Many Requests - quota exceeded"
    )
  })
})
