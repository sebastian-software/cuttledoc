import { describe, expect, it, vi } from "vitest"

import type { EnhanceResult, LLMProvider } from "../types.js"
import { LocalProcessor } from "./local.js"
import { OllamaProcessor } from "./ollama.js"
import { OpenAIProcessor } from "./openai.js"

function resultFor(markdown: string, provider: LLMProvider): EnhanceResult {
  const tokens = markdown.split(/\s+/).length
  return {
    markdown,
    plainText: markdown,
    stats: {
      processingTimeSeconds: 0.1,
      inputTokens: tokens,
      outputTokens: tokens,
      tokensPerSecond: 10,
      correctionsCount: 0,
      paragraphCount: 1,
      provider,
      model: "test-model"
    },
    corrections: []
  }
}

describe("provider chunking", () => {
  it("chunks Ollama requests", async () => {
    const processor = new OllamaProcessor({ model: "test-model" })
    const enhance = vi
      .spyOn(processor, "enhance")
      .mockImplementation((chunk) => Promise.resolve(resultFor(chunk, "ollama")))

    const result = await processor.enhanceChunked("one two three four five", { chunkSize: 2 })

    expect(enhance).toHaveBeenCalledTimes(3)
    expect(result.markdown).toBe("one two\n\nthree four\n\nfive")
  })

  it("chunks OpenAI requests", async () => {
    const processor = new OpenAIProcessor({ model: "test-model", apiKey: "test-key" })
    const enhance = vi
      .spyOn(processor, "enhance")
      .mockImplementation((chunk) => Promise.resolve(resultFor(chunk, "openai")))

    const result = await processor.enhanceChunked("one two three four five", { chunkSize: 2 })

    expect(enhance).toHaveBeenCalledTimes(3)
    expect(result.markdown).toBe("one two\n\nthree four\n\nfive")
  })

  it("keeps local processing on the shared chunking path", async () => {
    const processor = new LocalProcessor()
    const enhance = vi
      .spyOn(processor, "enhance")
      .mockImplementation((chunk) => Promise.resolve(resultFor(chunk, "local")))

    const result = await processor.enhanceChunked("one two three four five", { chunkSize: 2 })

    expect(enhance).toHaveBeenCalledTimes(3)
    expect(result.markdown).toBe("one two\n\nthree four\n\nfive")
  })
})
