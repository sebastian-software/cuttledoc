/**
 * LLM processing types for transcript enhancement
 */

/**
 * Available LLM providers
 */
export type LLMProvider = "ollama" | "openai" | "local"

/**
 * Supported local LLM models (for node-llama-cpp)
 */
export const LOCAL_MODELS = {
  // Gemma 3n - Optimized for edge devices
  "gemma3n:e4b": {
    ggufRepo: "bartowski/gemma-3n-E4B-it-GGUF",
    ggufFile: "gemma-3n-E4B-it-Q4_K_M.gguf",
    contextSize: 32768,
    description: "Google Gemma 3n E4B - Best quality/size ratio, 3GB RAM"
  },
  "gemma3n:e2b": {
    ggufRepo: "bartowski/gemma-3n-E2B-it-GGUF",
    ggufFile: "gemma-3n-E2B-it-Q4_K_M.gguf",
    contextSize: 32768,
    description: "Google Gemma 3n E2B - Ultra-efficient, 2GB RAM"
  },
  // Qwen 3 - Excellent multilingual
  "qwen3:4b": {
    ggufRepo: "bartowski/Qwen3-4B-GGUF",
    ggufFile: "Qwen3-4B-Q4_K_M.gguf",
    contextSize: 32768,
    description: "Alibaba Qwen 3 4B - Fast, great for multilingual"
  },
  "qwen3:8b": {
    ggufRepo: "bartowski/Qwen3-8B-GGUF",
    ggufFile: "Qwen3-8B-Q4_K_M.gguf",
    contextSize: 32768,
    description: "Alibaba Qwen 3 8B - Higher quality multilingual"
  }
} as const

export type LocalModelId = keyof typeof LOCAL_MODELS

/**
 * Recommended Ollama models for transcript processing
 *
 * Focus: Multilingual text understanding (DE, FR, ES, PT, EN)
 * No reasoning required - just grammar, punctuation, word boundaries
 */
export const OLLAMA_MODELS = {
  "gemma3n:e4b": "Google Gemma 3n E4B - Fast, efficient, edge-optimized (3GB)",
  "qwen3:8b": "Alibaba Qwen 3 - Excellent multilingual support (5GB)",
  "mistral-small:24b": "Mistral Small 3.1 - Strong EU language support (14GB)"
} as const

export type OllamaModelId = keyof typeof OLLAMA_MODELS

/**
 * OpenAI models for transcript processing
 */
export const OPENAI_MODELS = {
  "gpt-5-mini": "GPT-5 Mini - Fast, cost-effective, best for text correction",
  "gpt-5-nano": "GPT-5 Nano - Ultra-fast, lowest cost"
} as const

export type OpenAIModelId = keyof typeof OPENAI_MODELS

/**
 * Processing mode
 */
export const PROCESS_MODES = {
  /** Formatting: Paragraphs, headings, markdown formatting + corrections */
  format: "format",
  /** Correction only: Fix transcription errors, no restructuring (default) */
  correct: "correct"
} as const

export type ProcessMode = keyof typeof PROCESS_MODES

/**
 * Options for enhancing a transcript
 */
export interface EnhanceOptions {
  /** Provider to use (auto-detected if not specified) */
  provider?: LLMProvider

  /** Model name (provider-specific) */
  model?: string

  /** Processing mode: "format" (full formatting) or "correct" (fixes only, default) */
  mode?: ProcessMode

  /** Temperature for generation (default: 0.3) */
  temperature?: number

  /** OpenAI API key (required for openai provider) */
  apiKey?: string

  /** Custom model path for local provider */
  modelPath?: string

  /** GPU layers to offload for local provider (-1 = all, 0 = CPU only) */
  gpuLayers?: number

  /** Context size override for local provider */
  contextSize?: number
}

/**
 * Result of LLM processing
 */
export interface EnhanceResult {
  /** Formatted markdown text */
  markdown: string

  /** Plain text (markdown stripped) */
  plainText: string

  /** Processing statistics */
  stats: {
    /** Time spent processing in seconds */
    processingTimeSeconds: number
    /** Input token count (approximate) */
    inputTokens: number
    /** Output token count */
    outputTokens: number
    /** Tokens per second */
    tokensPerSecond: number
    /** Number of corrections made */
    correctionsCount: number
    /** Number of paragraphs created */
    paragraphCount: number
    /** Provider used */
    provider: LLMProvider
    /** Model used */
    model: string
  }

  /** Detected corrections (before → after) */
  corrections: Correction[]
}

/**
 * A detected correction
 */
export interface Correction {
  original: string
  corrected: string
}

/**
 * System prompt for transcript formatting (paragraphs, headings, markdown)
 */
export const TRANSCRIPT_FORMAT_PROMPT = `You are an expert at formatting video transcripts for readability.

Your task:
1. **Structure**: Organize the text into logical paragraphs at natural speech pauses
2. **Headings**: Add ## or ### headings for clear topic changes
3. **Formatting**:
   - **Bold** for key terms and important statements
   - *Italic* for emphasis and proper nouns
   - Bullet lists where appropriate (e.g., when speaker lists items)
4. **Corrections**: Fix obvious transcription errors (misheard words, homophones)

Rules:
- KEEP the original language of the transcript (do not translate)
- PRESERVE the original wording - do not rephrase or paraphrase
- DO NOT add information that wasn't spoken
- DO NOT remove any statements
- DO NOT summarize - output the complete text
- MAINTAIN the speaker's voice and style
- Output ONLY the formatted markdown, no meta-commentary

Format the following transcript:`

/**
 * Minimal prompt for correction-only mode (no restructuring)
 *
 * Key design principles:
 * - Explicit role definition as transcript proofreader
 * - Clear prohibition of summarizing, rephrasing, translating
 * - Focus on STT-specific error patterns
 * - Language preservation mandate
 */
export const TRANSCRIPT_CORRECTION_PROMPT = `You are a transcript proofreader. You receive raw speech-to-text output that may contain misheard words, broken word boundaries, missing punctuation, and capitalization errors.

Your goal is to produce a **readable, correct** transcript while keeping the **meaning and language unchanged**.

## What to fix:
- **Word boundaries**: Split or merge incorrectly joined/split words (e.g., "to gether" → "together")
- **Misheard words**: Fix obvious mishearings based on context (e.g., "their" vs "there")
- **Grammar**: Correct grammatical errors typical of speech-to-text systems
- **Punctuation**: Add periods, commas, question marks, exclamation points appropriately
- **Capitalization**: Apply correct capitalization for sentence starts and proper nouns

## Strict rules:
- **DO NOT translate** - keep the original language (German stays German, Spanish stays Spanish, etc.)
- **DO NOT summarize** - output must be the same length as input
- **DO NOT rephrase** - preserve the original wording and sentence structure
- **DO NOT add content** - no new words, facts, or explanations
- **DO NOT add commentary** - no meta-text like "Here is the corrected version"
- **Keep conversational tone** - preserve "um", "uh" only if they seem intentional

## Output format:
Return ONLY the corrected transcript text. Nothing else.

Transcript:`

/**
 * Extract plain text from markdown
 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Bold
    .replace(/\*([^*]+)\*/g, "$1") // Italic
    .replace(/_([^_]+)_/g, "$1") // Underscore italic
    .replace(/`([^`]+)`/g, "$1") // Code
    .replace(/^#+\s+/gm, "") // Headers
    .replace(/^[-*]\s+/gm, "") // Lists
    .replace(/\n{3,}/g, "\n\n") // Multiple newlines
    .trim()
}

/**
 * Count paragraphs in text
 */
export function countParagraphs(text: string): number {
  return text.split(/\n\n+/).filter((p) => p.trim().length > 0).length
}

/**
 * Diff two texts and find changed words
 */
export function findCorrections(original: string, corrected: string): Correction[] {
  const originalWords = original.toLowerCase().split(/\s+/)
  const correctedPlain = stripMarkdown(corrected)
  const correctedWords = correctedPlain.toLowerCase().split(/\s+/)

  const corrections: Correction[] = []

  // Simple word-by-word comparison
  const minLen = Math.min(originalWords.length, correctedWords.length)

  for (let i = 0; i < minLen; i++) {
    const orig = originalWords[i]
    const corr = correctedWords[i]

    if (orig !== undefined && corr !== undefined && orig !== corr) {
      // Check if it's a real correction (not just punctuation)
      const origClean = orig.replace(/[.,!?;:]/g, "")
      const corrClean = corr.replace(/[.,!?;:]/g, "")

      if (origClean !== corrClean && origClean.length > 2) {
        corrections.push({ original: orig, corrected: corr })
      }
    }
  }

  return corrections
}
