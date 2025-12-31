/**
 * OpenAI-based LLM processing
 *
 * Cloud provider for transcript enhancement using OpenAI's API.
 * Requires: OPENAI_API_KEY environment variable
 */

import {
  countParagraphs,
  findCorrections,
  stripMarkdown,
  TRANSCRIPT_CORRECTION_PROMPT,
  TRANSCRIPT_ENHANCEMENT_PROMPT,
  type EnhanceResult,
  type ProcessMode
} from "../types.js"

/** OpenAI API base URL */
const OPENAI_BASE_URL = process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1"

interface OpenAIChatResponse {
  id: string
  choices: {
    message: {
      content: string
    }
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Check if OpenAI API key is available
 */
export function hasOpenAIKey(): boolean {
  return process.env["OPENAI_API_KEY"] !== undefined && process.env["OPENAI_API_KEY"].length > 0
}

/**
 * OpenAI-based LLM Processor
 */
export class OpenAIProcessor {
  private readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(options: { model?: string; apiKey?: string } = {}) {
    this.model = options.model ?? "gpt-4o-mini"
    this.apiKey = options.apiKey ?? process.env["OPENAI_API_KEY"] ?? ""
    this.baseUrl = OPENAI_BASE_URL

    if (this.apiKey.length === 0) {
      throw new Error("OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey option.")
    }
  }

  /**
   * Check if OpenAI is available
   */
  isAvailable(): boolean {
    return this.apiKey.length > 0
  }

  /**
   * Enhance a transcript with formatting and corrections
   */
  async enhance(
    rawTranscript: string,
    options: {
      mode?: ProcessMode
      temperature?: number
    } = {}
  ): Promise<EnhanceResult> {
    const startTime = performance.now()

    // Select prompt based on mode
    const mode = options.mode ?? "enhance"
    const systemPrompt = mode === "correct" ? TRANSCRIPT_CORRECTION_PROMPT : TRANSCRIPT_ENHANCEMENT_PROMPT

    // Call OpenAI Chat Completions API
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawTranscript }
        ],
        temperature: options.temperature ?? 0.3
      }),
      signal: AbortSignal.timeout(300_000) // 5 minute timeout
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API error: ${String(response.status)} ${response.statusText} - ${errorText}`)
    }

    const data = (await response.json()) as OpenAIChatResponse
    const enhancedText = data.choices[0]?.message.content ?? ""

    const processingTime = (performance.now() - startTime) / 1000

    // Analyze results
    const corrections = findCorrections(rawTranscript, enhancedText)
    const paragraphCount = countParagraphs(enhancedText)
    const plainText = stripMarkdown(enhancedText)

    const outputTokens = data.usage.completion_tokens
    const tokensPerSecond = outputTokens / processingTime

    return {
      markdown: enhancedText,
      plainText,
      stats: {
        processingTimeSeconds: processingTime,
        inputTokens: data.usage.prompt_tokens,
        outputTokens,
        tokensPerSecond,
        correctionsCount: corrections.length,
        paragraphCount,
        provider: "openai",
        model: this.model
      },
      corrections
    }
  }

  /**
   * No cleanup needed for OpenAI (stateless HTTP)
   */
  async dispose(): Promise<void> {
    await Promise.resolve()
  }
}

/**
 * Quick helper to enhance a transcript via OpenAI
 */
export async function enhanceWithOpenAI(
  transcript: string,
  options: { model?: string; mode?: ProcessMode; apiKey?: string } = {}
): Promise<EnhanceResult> {
  // Build processor options (filter undefined)
  const processorOpts: { model?: string; apiKey?: string } = {}
  if (options.model !== undefined) processorOpts.model = options.model
  if (options.apiKey !== undefined) processorOpts.apiKey = options.apiKey

  const processor = new OpenAIProcessor(processorOpts)

  // Build enhance options (filter undefined)
  const enhanceOpts: { mode?: ProcessMode } = {}
  if (options.mode !== undefined) enhanceOpts.mode = options.mode

  return processor.enhance(transcript, enhanceOpts)
}
