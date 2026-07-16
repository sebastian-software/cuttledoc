import { describe, expect, it, vi } from "vitest"

import { enhanceTranscriptInChunks, splitTranscriptIntoChunks } from "./chunking.js"
import type { EnhanceResult } from "./types.js"

function resultFor(markdown: string): EnhanceResult {
  const normalizedMarkdown = markdown.trim()
  return {
    markdown: normalizedMarkdown,
    plainText: normalizedMarkdown,
    stats: {
      processingTimeSeconds: 0.1,
      inputTokens: normalizedMarkdown.split(/\s+/).length,
      outputTokens: normalizedMarkdown.split(/\s+/).length,
      tokensPerSecond: 10,
      correctionsCount: 0,
      paragraphCount: 1,
      provider: "ollama",
      model: "test-model"
    },
    corrections: []
  }
}

describe("splitTranscriptIntoChunks", () => {
  it("keeps short transcripts unchanged", () => {
    expect(splitTranscriptIntoChunks("  short transcript  ", 3)).toEqual(["  short transcript  "])
  })

  it("prefers sentence boundaries while respecting the word limit", () => {
    expect(splitTranscriptIntoChunks("One two. Three four five. Six seven eight", 4)).toEqual([
      "One two. ",
      "Three four five. ",
      "Six seven eight"
    ])
  })

  it("hard-splits long sentences so no chunk exceeds the limit", () => {
    const chunks = splitTranscriptIntoChunks("one two three four five six seven", 3)

    expect(chunks).toEqual(["one two three ", "four five six ", "seven"])
    expect(chunks.every((chunk) => chunk.trim().split(/\s+/).length <= 3)).toBe(true)
  })

  it("preserves whitespace across long transcript chunks", () => {
    const transcript = "  one  two\nthree\n\nfour five  "
    const chunks = splitTranscriptIntoChunks(transcript, 2)

    expect(chunks.join("")).toBe(transcript)
    expect(chunks).toEqual(["  one  two\n", "three\n\nfour ", "five  "])
  })

  it("rejects invalid chunk sizes", () => {
    expect(() => splitTranscriptIntoChunks("text", 0)).toThrow("chunkSize must be a positive integer")
  })
})

describe("enhanceTranscriptInChunks", () => {
  it("processes every chunk and combines provider results", async () => {
    const onChunk = vi.fn()
    const enhance = vi.fn((chunk: string) => Promise.resolve(resultFor(chunk.toUpperCase())))

    const result = await enhanceTranscriptInChunks("one two three four five", enhance, {
      chunkSize: 2,
      onChunk
    })

    expect(enhance).toHaveBeenCalledTimes(3)
    expect(onChunk).toHaveBeenCalledTimes(3)
    expect(result.markdown).toBe("ONE TWO\n\nTHREE FOUR\n\nFIVE")
    expect(result.stats.inputTokens).toBe(5)
    expect(result.stats.outputTokens).toBe(5)
    expect(result.stats.tokensPerSecond).toBe(10)
    expect(result.stats.provider).toBe("ollama")
    expect(result.stats.model).toBe("test-model")
  })

  it("uses the direct provider path for short transcripts", async () => {
    const enhance = vi.fn((chunk: string) => Promise.resolve(resultFor(chunk)))

    await enhanceTranscriptInChunks("short transcript", enhance, { chunkSize: 2 })

    expect(enhance).toHaveBeenCalledOnce()
    expect(enhance).toHaveBeenCalledWith("short transcript", {})
  })
})
