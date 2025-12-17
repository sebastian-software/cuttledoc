/**
 * Ollama-based LLM processing
 *
 * Simple HTTP client for Ollama - no tokens, no accounts, just works.
 * Requires: `brew install ollama && ollama pull gemma3:4b`
 */

import {
  countParagraphs,
  findCorrections,
  stripMarkdown,
  TRANSCRIPT_CORRECTION_PROMPT,
  TRANSCRIPT_ENHANCEMENT_PROMPT,
  type LLMProcessResult,
  type ProcessMode
} from "./types.js"

/** Ollama API base URL */
const OLLAMA_BASE_URL = process.env["OLLAMA_HOST"] ?? "http://localhost:11434"

/** Recommended models for transcript processing */
export const OLLAMA_MODELS = {
  "gemma3:4b": "Best balance of speed and quality for transcripts",
  "gemma3:12b": "Higher quality, needs more RAM",
  "qwen2.5:3b": "Excellent multilingual support",
  "llama3.2:3b": "Fast and capable"
} as const

export type OllamaModelId = keyof typeof OLLAMA_MODELS

interface OllamaGenerateResponse {
  response: string
  done: boolean
  total_duration?: number
  eval_count?: number
  eval_duration?: number
}

/**
 * Check if Ollama is running
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(2000)
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * List available models in Ollama
 */
export async function listOllamaModels(): Promise<string[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.statusText}`)
  }
  const data = (await response.json()) as { models: { name: string }[] }
  return data.models.map((m) => m.name)
}

/**
 * Check if a specific model is available
 */
export async function hasOllamaModel(model: string): Promise<boolean> {
  const models = await listOllamaModels()
  return models.some((m) => m.startsWith(model))
}

/**
 * Ollama-based LLM Processor
 */
export class OllamaProcessor {
  private readonly model: string
  private readonly baseUrl: string

  constructor(options: { model?: string } = {}) {
    this.model = options.model ?? "gemma3:4b"
    this.baseUrl = OLLAMA_BASE_URL
  }

  /**
   * Check if Ollama is available with the configured model
   */
  async isAvailable(): Promise<boolean> {
    if (!(await isOllamaRunning())) {
      return false
    }
    return hasOllamaModel(this.model)
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
  ): Promise<LLMProcessResult> {
    const startTime = performance.now()

    // Select prompt based on mode
    const mode = options.mode ?? "enhance"
    const systemPrompt = mode === "correct" ? TRANSCRIPT_CORRECTION_PROMPT : TRANSCRIPT_ENHANCEMENT_PROMPT

    const prompt = `${systemPrompt}\n\n---\n\n${rawTranscript}`

    // Call Ollama API
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3
        }
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`)
    }

    const data = (await response.json()) as OllamaGenerateResponse
    const enhancedText = data.response

    const processingTime = (performance.now() - startTime) / 1000

    // Analyze results
    const corrections = findCorrections(rawTranscript, enhancedText)
    const paragraphCount = countParagraphs(enhancedText)
    const plainText = stripMarkdown(enhancedText)

    // Calculate tokens per second from Ollama metrics
    const tokensPerSecond =
      data.eval_count && data.eval_duration
        ? data.eval_count / (data.eval_duration / 1e9)
        : enhancedText.split(/\s+/).length / processingTime

    return {
      markdown: enhancedText,
      plainText,
      stats: {
        processingTimeSeconds: processingTime,
        inputTokens: rawTranscript.split(/\s+/).length,
        outputTokens: data.eval_count ?? enhancedText.split(/\s+/).length,
        tokensPerSecond,
        correctionsCount: corrections.length,
        paragraphCount
      },
      corrections
    }
  }

  /**
   * No cleanup needed for Ollama (stateless HTTP)
   */
  async dispose(): Promise<void> {
    // Nothing to dispose - Ollama manages its own resources
  }
}

/**
 * Quick helper to enhance a transcript via Ollama
 */
export async function enhanceWithOllama(
  transcript: string,
  options: { model?: string; mode?: ProcessMode } = {}
): Promise<LLMProcessResult> {
  const processor = new OllamaProcessor({ model: options.model })
  return processor.enhance(transcript, { mode: options.mode })
}
