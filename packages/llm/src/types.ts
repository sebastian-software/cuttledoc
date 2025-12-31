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
  // Gemma 3n - Newest, optimized for edge devices (July 2025)
  "gemma3n:e4b": {
    ggufRepo: "bartowski/gemma-3n-E4B-it-GGUF",
    ggufFile: "gemma-3n-E4B-it-Q4_K_M.gguf",
    contextSize: 32768,
    description: "Google Gemma 3n E4B - Best quality/size ratio, >1300 LMArena, 3GB RAM"
  },
  "gemma3n:e2b": {
    ggufRepo: "bartowski/gemma-3n-E2B-it-GGUF",
    ggufFile: "gemma-3n-E2B-it-Q4_K_M.gguf",
    contextSize: 32768,
    description: "Google Gemma 3n E2B - Ultra-efficient, 2GB RAM"
  },
  // Gemma 3 - Stable, well-tested
  "gemma3:4b": {
    ggufRepo: "bartowski/gemma-3-4b-it-GGUF",
    ggufFile: "gemma-3-4b-it-Q4_K_M.gguf",
    contextSize: 8192,
    description: "Google Gemma 3 4B - Stable, 140 languages"
  },
  "gemma3:12b": {
    ggufRepo: "bartowski/gemma-3-12b-it-GGUF",
    ggufFile: "gemma-3-12b-it-Q4_K_M.gguf",
    contextSize: 8192,
    description: "Google Gemma 3 12B - Higher quality, needs 8GB+ RAM"
  },
  // Other models
  "deepseek-r1:1.5b": {
    ggufRepo: "bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF",
    ggufFile: "DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf",
    contextSize: 4096,
    description: "DeepSeek R1 1.5B - Fast reasoning model"
  },
  "qwen2.5:3b": {
    ggufRepo: "Qwen/Qwen2.5-3B-Instruct-GGUF",
    ggufFile: "qwen2.5-3b-instruct-q4_k_m.gguf",
    contextSize: 8192,
    description: "Qwen 2.5 3B - Excellent for German and multilingual"
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
  "gemma3n:e4b": "Google Gemma 3n - Fast, efficient, edge-optimized (3GB)",
  "qwen2.5:7b": "Alibaba Qwen 2.5 - Best multilingual support (5GB)",
  "mistral:7b": "Mistral 7B - Good EU language support (5GB)"
} as const

export type OllamaModelId = keyof typeof OLLAMA_MODELS

/**
 * OpenAI models for transcript processing
 */
export const OPENAI_MODELS = {
  "gpt-4o-mini": "Fast and cost-effective",
  "gpt-4o": "Highest quality",
  "gpt-4-turbo": "Good balance of quality and speed"
} as const

export type OpenAIModelId = keyof typeof OPENAI_MODELS

/**
 * Processing mode
 */
export const PROCESS_MODES = {
  /** Full enhancement: TLDR, headings, formatting, corrections */
  enhance: "enhance",
  /** Correction only: Fix transcription errors, no restructuring */
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

  /** Processing mode: "enhance" (full formatting) or "correct" (fixes only) */
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
 * System prompt for transcript enhancement
 */
export const TRANSCRIPT_ENHANCEMENT_PROMPT = `You are an expert at formatting and enhancing video transcripts.

Your task:
1. **TLDR**: Start with a brief summary (2-3 sentences) under a "## TLDR" heading
2. **Structure**: Organize the text into logical paragraphs at natural speech pauses
3. **Headings**: Add ## or ### headings for clear topic changes
4. **Formatting**:
   - **Bold** for key terms and important statements
   - *Italic* for emphasis and proper nouns
   - Bullet lists where appropriate (e.g., when speaker lists items)
5. **Corrections**: Fix only obvious transcription errors (misheard words, homophones)

Rules:
- KEEP the original language of the transcript (do not translate)
- PRESERVE the original wording - do not rephrase or paraphrase
- DO NOT add information that wasn't spoken
- DO NOT remove any statements
- MAINTAIN the speaker's voice and style
- Output ONLY the formatted markdown, no meta-commentary

Format the following transcript:`

/**
 * Minimal prompt for correction-only mode (no restructuring)
 */
export const TRANSCRIPT_CORRECTION_PROMPT = `Fix this speech-to-text transcript in three steps:

1. GRAMMAR: Check if sentences are grammatically correct. Fix word boundaries by splitting or merging words/word parts where needed.

2. PUNCTUATION: Fix commas, periods, and other punctuation marks.

3. CAPITALIZATION: Apply correct capitalization rules for the target language.

Output ONLY the corrected text, nothing else.

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
