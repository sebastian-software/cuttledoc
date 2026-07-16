import { countParagraphs, stripMarkdown, type EnhanceResult, type ProcessMode } from "./types.js"

export const DEFAULT_CHUNK_SIZE = 2000

export interface ChunkedEnhanceOptions {
  mode?: ProcessMode
  temperature?: number
  chunkSize?: number
  onChunk?: (chunk: string, index: number, total: number) => void
}

type EnhanceChunk = (
  transcript: string,
  options: { mode?: ProcessMode; temperature?: number }
) => Promise<EnhanceResult>

/** Split a transcript at sentence boundaries without exceeding the word limit. */
export function splitTranscriptIntoChunks(
  rawTranscript: string,
  chunkSize = DEFAULT_CHUNK_SIZE
): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("chunkSize must be a positive integer")
  }

  const trimmedTranscript = rawTranscript.trim()
  if (trimmedTranscript.length === 0) {
    return [rawTranscript]
  }

  const words = trimmedTranscript.split(/\s+/)
  if (words.length <= chunkSize) {
    return [rawTranscript]
  }

  const chunks: string[] = []
  let start = 0

  while (start < words.length) {
    let end = Math.min(start + chunkSize, words.length)

    if (end < words.length) {
      const earliestBoundary = start + Math.floor((chunkSize - 1) / 2)
      for (let index = end - 1; index >= earliestBoundary; index--) {
        if (/[.!?]$/.test(words[index] ?? "")) {
          end = index + 1
          break
        }
      }
    }

    chunks.push(words.slice(start, end).join(" "))
    start = end
  }

  return chunks
}

/** Process and combine bounded transcript chunks with any LLM provider. */
export async function enhanceTranscriptInChunks(
  rawTranscript: string,
  enhance: EnhanceChunk,
  options: ChunkedEnhanceOptions = {}
): Promise<EnhanceResult> {
  const chunks = splitTranscriptIntoChunks(rawTranscript, options.chunkSize)
  const enhanceOptions: { mode?: ProcessMode; temperature?: number } = {}
  if (options.mode !== undefined) enhanceOptions.mode = options.mode
  if (options.temperature !== undefined) enhanceOptions.temperature = options.temperature

  if (chunks.length === 1) {
    return enhance(rawTranscript, enhanceOptions)
  }

  const results: EnhanceResult[] = []
  const startTime = performance.now()

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]
    if (chunk === undefined) continue

    options.onChunk?.(chunk, index, chunks.length)
    results.push(await enhance(chunk, enhanceOptions))
  }

  const firstResult = results[0]
  if (firstResult === undefined) {
    throw new Error("Transcript chunking produced no results")
  }

  const markdown = results.map((result) => result.markdown).join("\n\n")
  const corrections = results.flatMap((result) => result.corrections)
  const inputTokens = results.reduce((total, result) => total + result.stats.inputTokens, 0)
  const outputTokens = results.reduce((total, result) => total + result.stats.outputTokens, 0)
  const processingTimeSeconds = (performance.now() - startTime) / 1000

  return {
    markdown,
    plainText: stripMarkdown(markdown),
    stats: {
      processingTimeSeconds,
      inputTokens,
      outputTokens,
      tokensPerSecond: processingTimeSeconds > 0 ? outputTokens / processingTimeSeconds : 0,
      correctionsCount: corrections.length,
      paragraphCount: countParagraphs(markdown),
      provider: firstResult.stats.provider,
      model: firstResult.stats.model
    },
    corrections
  }
}
