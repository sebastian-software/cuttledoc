/**
 * Local LLM processing using node-llama-cpp
 *
 * Native Node.js bindings - no external processes or CLI tools.
 * Downloads GGUF models from Hugging Face automatically.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"

import {
  countParagraphs,
  findCorrections,
  LOCAL_MODELS,
  stripMarkdown,
  TRANSCRIPT_CORRECTION_PROMPT,
  TRANSCRIPT_FORMAT_PROMPT,
  type EnhanceResult,
  type LocalModelId,
  type ProcessMode
} from "../types.js"

import type {
  getLlama,
  Llama,
  LlamaChatSession,
  LlamaContext,
  LlamaModel,
  createModelDownloader,
  resolveModelFile
} from "node-llama-cpp"

// Type definitions for dynamic import
interface LlamaModule {
  getLlama: typeof getLlama
  LlamaChatSession: typeof LlamaChatSession
  createModelDownloader: typeof createModelDownloader
  resolveModelFile: typeof resolveModelFile
}

// Lazy-loaded node-llama-cpp module
let llamaModule: LlamaModule | null = null

/**
 * Load the node-llama-cpp module
 */
async function loadLlamaModule(): Promise<LlamaModule> {
  if (llamaModule === null) {
    try {
      const mod = await import("node-llama-cpp")
      llamaModule = mod as unknown as LlamaModule
    } catch {
      throw new Error("node-llama-cpp is not installed. Run: npm install node-llama-cpp")
    }
  }
  return llamaModule
}

/**
 * Get the models directory for LLM models
 */
function getModelsDir(): string {
  return (
    process.env["CUTTLEDOC_LLM_MODELS_DIR"] ??
    process.env["LOCAL_TRANSCRIBE_LLM_MODELS_DIR"] ??
    join(process.cwd(), "models", "llm")
  )
}

/**
 * Check if models directory exists
 */
export function hasModelsDirectory(): boolean {
  return existsSync(getModelsDir())
}

/**
 * Check if a specific LLM model is downloaded
 */
export function isModelDownloaded(modelId: LocalModelId): boolean {
  const modelInfo = LOCAL_MODELS[modelId]
  const modelsDir = getModelsDir()

  if (!existsSync(modelsDir)) {
    return false
  }

  // Check for the exact filename or prefixed version
  const exactPath = join(modelsDir, modelInfo.ggufFile)
  if (existsSync(exactPath)) {
    return true
  }

  // Check for node-llama-cpp's prefixed version (e.g., "hf_Qwen_...")
  try {
    const files = readdirSync(modelsDir)
    const baseFilename = modelInfo.ggufFile.toLowerCase()
    return files.some((f) => f.toLowerCase().includes(baseFilename.replace(".gguf", "")))
  } catch {
    return false
  }
}

/**
 * Download a model from Hugging Face (or return cached path)
 */
export async function downloadModel(
  modelId: LocalModelId,
  options: { onProgress?: (progress: number) => void } = {}
): Promise<string> {
  const modelInfo = LOCAL_MODELS[modelId]
  const modelsDir = getModelsDir()

  // Create directory if needed
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true })
  }

  const llama = await loadLlamaModule()

  console.log(`Resolving ${modelId} from ${modelInfo.ggufRepo}...`)

  const downloadedPath = await llama.resolveModelFile(`hf:${modelInfo.ggufRepo}/${modelInfo.ggufFile}`, {
    directory: modelsDir,
    onProgress: (status) => {
      if (options.onProgress !== undefined && status.totalSize > 0) {
        options.onProgress(status.downloadedSize / status.totalSize)
      }
    }
  })

  return downloadedPath
}

/**
 * Local LLM Processor using node-llama-cpp
 */
export class LocalProcessor {
  private llama: Llama | null = null
  private model: LlamaModel | null = null
  private context: LlamaContext | null = null
  private isInitialized = false

  private readonly modelId: LocalModelId
  private readonly modelPath: string | undefined
  private readonly gpuLayers: number
  private readonly contextSize: number

  constructor(
    options: {
      model?: LocalModelId
      modelPath?: string
      gpuLayers?: number
      contextSize?: number
    } = {}
  ) {
    this.modelId = options.model ?? "gemma3n:e4b"
    this.modelPath = options.modelPath
    this.gpuLayers = options.gpuLayers ?? -1 // All layers on GPU by default
    const modelInfo = LOCAL_MODELS[this.modelId]
    this.contextSize = options.contextSize ?? modelInfo.contextSize
  }

  /**
   * Initialize the LLM
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    const llamaModule = await loadLlamaModule()

    // Get or download model
    const modelPath = this.modelPath ?? (await downloadModel(this.modelId))

    // Initialize llama.cpp
    this.llama = await llamaModule.getLlama()

    // Load model
    this.model = await this.llama.loadModel({
      modelPath,
      gpuLayers: this.gpuLayers
    })

    // Create context
    this.context = await this.model.createContext({
      contextSize: this.contextSize
    })

    this.isInitialized = true
  }

  /**
   * Check if local LLM is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await loadLlamaModule()
      return true
    } catch {
      return false
    }
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
    if (!this.isInitialized || this.context === null || this.model === null) {
      await this.initialize()
    }

    if (this.context === null) {
      throw new Error("Failed to initialize LLM context")
    }

    const llamaModule = await loadLlamaModule()
    const startTime = performance.now()

    // Create chat session with a fresh sequence
    const sequence = this.context.getSequence()
    const session = new llamaModule.LlamaChatSession({
      contextSequence: sequence
    })

    // Select prompt based on mode
    const mode = options.mode ?? "correct"
    const systemPrompt = mode === "correct" ? TRANSCRIPT_CORRECTION_PROMPT : TRANSCRIPT_FORMAT_PROMPT

    const prompt = `${systemPrompt}\n\n---\n\n${rawTranscript}`

    // Generate enhanced text
    let response: string
    try {
      response = await session.prompt(prompt, {
        temperature: options.temperature ?? 0.3,
        maxTokens: this.contextSize - 1000 // Leave room for prompt
      })
    } finally {
      // Release sequence for reuse
      sequence.dispose()
    }

    const processingTime = (performance.now() - startTime) / 1000

    // Analyze results
    const corrections = findCorrections(rawTranscript, response)
    const paragraphCount = countParagraphs(response)
    const plainText = stripMarkdown(response)

    // Approximate token counts
    const inputTokens = rawTranscript.split(/\s+/).length
    const outputTokens = response.split(/\s+/).length

    return {
      markdown: response,
      plainText,
      stats: {
        processingTimeSeconds: processingTime,
        inputTokens,
        outputTokens,
        tokensPerSecond: outputTokens / processingTime,
        correctionsCount: corrections.length,
        paragraphCount,
        provider: "local",
        model: this.modelId
      },
      corrections
    }
  }

  /**
   * Process transcript in chunks (for very long transcripts)
   */
  async enhanceChunked(
    rawTranscript: string,
    options: {
      mode?: ProcessMode
      temperature?: number
      chunkSize?: number
      onChunk?: (chunk: string, index: number, total: number) => void
    } = {}
  ): Promise<EnhanceResult> {
    const chunkSize = options.chunkSize ?? 2000 // Words per chunk
    const words = rawTranscript.split(/\s+/)

    // Build enhance options (filter undefined)
    const enhanceOpts: { mode?: ProcessMode; temperature?: number } = {}
    if (options.mode !== undefined) enhanceOpts.mode = options.mode
    if (options.temperature !== undefined) enhanceOpts.temperature = options.temperature

    // If small enough, process directly
    if (words.length <= chunkSize) {
      return await this.enhance(rawTranscript, enhanceOpts)
    }

    // Split into chunks at sentence boundaries
    const chunks: string[] = []
    let currentChunk: string[] = []

    for (const word of words) {
      currentChunk.push(word)

      if (currentChunk.length >= chunkSize && /[.!?]$/.test(word)) {
        chunks.push(currentChunk.join(" "))
        currentChunk = []
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "))
    }

    // Process each chunk
    const enhancedChunks: string[] = []
    const allCorrections: { original: string; corrected: string }[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0
    const startTime = performance.now()

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      if (chunk === undefined) {
        continue
      }

      if (options.onChunk !== undefined) {
        options.onChunk(chunk, i, chunks.length)
      }

      const result = await this.enhance(chunk, enhanceOpts)

      enhancedChunks.push(result.markdown)
      allCorrections.push(...result.corrections)
      totalInputTokens += result.stats.inputTokens
      totalOutputTokens += result.stats.outputTokens
    }

    const totalTime = (performance.now() - startTime) / 1000
    const markdown = enhancedChunks.join("\n\n")

    return {
      markdown,
      plainText: stripMarkdown(markdown),
      stats: {
        processingTimeSeconds: totalTime,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        tokensPerSecond: totalOutputTokens / totalTime,
        correctionsCount: allCorrections.length,
        paragraphCount: countParagraphs(markdown),
        provider: "local",
        model: this.modelId
      },
      corrections: allCorrections
    }
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.context !== null) {
      await this.context.dispose()
      this.context = null
    }
    if (this.model !== null) {
      await this.model.dispose()
      this.model = null
    }
    this.isInitialized = false
  }
}

/**
 * Quick helper to enhance a transcript via local LLM
 */
export async function enhanceWithLocal(
  transcript: string,
  options: { model?: LocalModelId; mode?: ProcessMode; modelPath?: string } = {}
): Promise<EnhanceResult> {
  // Build processor options (filter undefined)
  const processorOpts: { model?: LocalModelId; modelPath?: string } = {}
  if (options.model !== undefined) processorOpts.model = options.model
  if (options.modelPath !== undefined) processorOpts.modelPath = options.modelPath

  const processor = new LocalProcessor(processorOpts)

  // Build enhance options (filter undefined)
  const enhanceOpts: { mode?: ProcessMode } = {}
  if (options.mode !== undefined) enhanceOpts.mode = options.mode

  try {
    await processor.initialize()
    return await processor.enhanceChunked(transcript, enhanceOpts)
  } finally {
    await processor.dispose()
  }
}
