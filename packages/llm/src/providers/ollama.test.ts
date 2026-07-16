import { afterEach, describe, expect, it, vi } from "vitest"

import { hasOllamaModel, isOllamaRunning, listOllamaModels, OllamaProcessor } from "./ollama.js"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Ollama availability", () => {
  it("checks the tags endpoint with a bounded request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(isOllamaRunning()).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toEqual(expect.stringMatching(/\/api\/tags$/))
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" })
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it("treats HTTP and network failures as unavailable", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error("connection refused"))
    vi.stubGlobal("fetch", fetchMock)

    await expect(isOllamaRunning()).resolves.toBe(false)
    await expect(isOllamaRunning()).resolves.toBe(false)
  })

  it("lists models and accepts Ollama's tagged model variants", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            models: [{ name: "phi4:14b-q4_K_M" }, { name: "gemma3:12b" }]
          })
        )
      )
    )

    await expect(listOllamaModels()).resolves.toEqual(["phi4:14b-q4_K_M", "gemma3:12b"])
    await expect(hasOllamaModel("phi4:14b")).resolves.toBe(true)
  })

  it("reports list failures without leaking them through model detection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500, statusText: "Server Error" })))

    await expect(listOllamaModels()).rejects.toThrow("Failed to list models: Server Error")
    await expect(hasOllamaModel("phi4:14b")).resolves.toBe(false)
  })
})

describe("OllamaProcessor", () => {
  it("sends the requested model and returns Ollama timing metrics", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(3_000)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        response: "**Hello world.**",
        done: true,
        eval_count: 20,
        eval_duration: 2_000_000_000
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await new OllamaProcessor({ model: "test-model" }).enhance("hello world", {
      mode: "format",
      temperature: 0.7
    })

    const request = fetchMock.mock.calls[0]
    expect(request?.[0]).toEqual(expect.stringMatching(/\/api\/generate$/))
    expect(request?.[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" }
    })
    const requestBody = request?.[1]?.body
    if (typeof requestBody !== "string") {
      throw new TypeError("Expected a string request body")
    }
    expect(JSON.parse(requestBody)).toMatchObject({
      model: "test-model",
      stream: false,
      options: { temperature: 0.7 }
    })
    expect(result).toMatchObject({
      markdown: "**Hello world.**",
      plainText: "Hello world.",
      stats: {
        processingTimeSeconds: 2,
        outputTokens: 20,
        tokensPerSecond: 10,
        provider: "ollama",
        model: "test-model"
      }
    })
  })

  it("surfaces an unsuccessful generation response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503, statusText: "Unavailable" })))

    await expect(new OllamaProcessor().enhance("hello")).rejects.toThrow("Ollama API error: Unavailable")
  })
})
