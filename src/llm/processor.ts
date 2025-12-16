/**
 * LLM-based transcript enhancement using node-llama-cpp
 *
 * Native Node.js bindings - no external processes or CLI tools
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  countParagraphs,
  findCorrections,
  LLM_MODELS,
  stripMarkdown,
  TRANSCRIPT_CORRECTION_PROMPT,
  TRANSCRIPT_ENHANCEMENT_PROMPT,
  type LLMModelId,
  type LLMProcessOptions,
  type LLMProcessResult,
  type ProcessMode,
} from "./types.js";

import type {
  getLlama,
  Llama,
  LlamaChatSession,
  LlamaContext,
  LlamaModel,
} from "node-llama-cpp";

// Type definitions
interface LlamaModule {
  getLlama: typeof getLlama;
  LlamaChatSession: typeof LlamaChatSession;
  createModelDownloader: (options: {
    modelUri: string;
    dirPath: string;
    onProgress?: (status: { downloadedSize: number; totalSize: number }) => void;
  }) => { download: () => Promise<string> };
}

// Lazy-loaded node-llama-cpp module
let llamaModule: LlamaModule | null = null;

/**
 * Load the node-llama-cpp module
 */
async function loadLlamaModule(): Promise<LlamaModule> {
  if (llamaModule === null) {
    try {
      const mod = await import("node-llama-cpp");
      llamaModule = mod as unknown as LlamaModule;
    } catch {
      throw new Error(
        "node-llama-cpp is not installed. Run: npm install node-llama-cpp"
      );
    }
  }
  return llamaModule;
}

/**
 * Get the models directory for LLM models
 */
function getModelsDir(): string {
  return process.env["LOCAL_TRANSCRIBE_LLM_MODELS_DIR"] ?? join(process.cwd(), "models", "llm");
}

/**
 * Check if a model is downloaded
 */
export function isModelDownloaded(modelId: LLMModelId): boolean {
  const modelInfo = LLM_MODELS[modelId];
  const modelsDir = getModelsDir();
  const modelPath = join(modelsDir, modelInfo.ggufFile);
  return existsSync(modelPath);
}

/**
 * Download a model from Hugging Face
 */
export async function downloadModel(
  modelId: LLMModelId,
  options: { onProgress?: (progress: number) => void } = {}
): Promise<string> {
  const modelInfo = LLM_MODELS[modelId];
  const modelsDir = getModelsDir();
  const modelPath = join(modelsDir, modelInfo.ggufFile);

  // Already downloaded?
  if (existsSync(modelPath)) {
    return modelPath;
  }

  // Create directory
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true });
  }

  // Use node-llama-cpp's built-in downloader
  const llama = await loadLlamaModule();

  // eslint-disable-next-line no-console
  console.log(`Downloading ${modelId} from ${modelInfo.ggufRepo}...`);

  const downloadedPath = await llama.createModelDownloader({
    modelUri: `hf:${modelInfo.ggufRepo}/${modelInfo.ggufFile}`,
    dirPath: modelsDir,
    onProgress: (status) => {
      if (options.onProgress !== undefined && status.totalSize > 0) {
        options.onProgress(status.downloadedSize / status.totalSize);
      }
    },
  }).download();

  // eslint-disable-next-line no-console
  console.log(`Downloaded to: ${downloadedPath}`);
  return downloadedPath;
}

/**
 * LLM Processor for transcript enhancement
 */
export class LLMProcessor {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private isInitialized = false;

  private readonly modelId: LLMModelId;
  private readonly modelPath: string | undefined;
  private readonly gpuLayers: number;
  private readonly contextSize: number;

  constructor(options: LLMProcessOptions = {}) {
    this.modelId = options.model ?? "gemma3n:e4b";
    this.modelPath = options.modelPath;
    this.gpuLayers = options.gpuLayers ?? -1; // All layers on GPU by default
    const modelInfo = LLM_MODELS[this.modelId];
    this.contextSize = options.contextSize ?? modelInfo.contextSize;
  }

  /**
   * Initialize the LLM
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const llamaModule = await loadLlamaModule();

    // Get or download model
    const modelPath = this.modelPath ?? await downloadModel(this.modelId);

    // Initialize llama.cpp
    this.llama = await llamaModule.getLlama();

    // Load model
    this.model = await this.llama.loadModel({
      modelPath,
      gpuLayers: this.gpuLayers,
    });

    // Create context
    this.context = await this.model.createContext({
      contextSize: this.contextSize,
    });

    this.isInitialized = true;
  }

  /**
   * Enhance a transcript with formatting and corrections
   */
  async enhance(
    rawTranscript: string,
    options: {
      mode?: ProcessMode | undefined;
      temperature?: number | undefined;
    } = {}
  ): Promise<LLMProcessResult> {
    if (!this.isInitialized || this.context === null || this.model === null) {
      await this.initialize();
    }

    if (this.context === null) {
      throw new Error("Failed to initialize LLM context");
    }

    const llamaModule = await loadLlamaModule();
    const startTime = performance.now();

    // Create chat session
    const session = new llamaModule.LlamaChatSession({
      contextSequence: this.context.getSequence(),
    });

    // Select prompt based on mode
    const mode = options.mode ?? "enhance";
    const systemPrompt = mode === "correct" 
      ? TRANSCRIPT_CORRECTION_PROMPT 
      : TRANSCRIPT_ENHANCEMENT_PROMPT;
    
    const prompt = `${systemPrompt}\n\n---\n\n${rawTranscript}`;

    // Generate enhanced text
    const response = await session.prompt(prompt, {
      temperature: options.temperature ?? 0.3,
      maxTokens: this.contextSize - 1000, // Leave room for prompt
    });

    const processingTime = (performance.now() - startTime) / 1000;

    // Analyze results
    const corrections = findCorrections(rawTranscript, response);
    const paragraphCount = countParagraphs(response);
    const plainText = stripMarkdown(response);

    // Get token counts from session
    const inputTokens = rawTranscript.split(/\s+/).length; // Approximation
    const outputTokens = response.split(/\s+/).length;

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
      },
      corrections,
    };
  }

  /**
   * Process transcript in chunks (for very long transcripts)
   */
  async enhanceChunked(
    rawTranscript: string,
    options: {
      mode?: ProcessMode | undefined;
      temperature?: number | undefined;
      chunkSize?: number | undefined;
      onChunk?: ((chunk: string, index: number, total: number) => void) | undefined;
    } = {}
  ): Promise<LLMProcessResult> {
    const chunkSize = options.chunkSize ?? 2000; // Words per chunk
    const words = rawTranscript.split(/\s+/);

    // If small enough, process directly
    if (words.length <= chunkSize) {
      return await this.enhance(rawTranscript, {
        mode: options.mode,
        temperature: options.temperature,
      });
    }

    // Split into chunks at sentence boundaries
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    for (const word of words) {
      currentChunk.push(word);

      if (currentChunk.length >= chunkSize && /[.!?]$/.test(word)) {
        chunks.push(currentChunk.join(" "));
        currentChunk = [];
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
    }

    // Process each chunk
    const enhancedChunks: string[] = [];
    const allCorrections: { original: string; corrected: string }[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const startTime = performance.now();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk === undefined) {
        continue;
      }

      if (options.onChunk !== undefined) {
        options.onChunk(chunk, i, chunks.length);
      }

      const result = await this.enhance(chunk, {
        mode: options.mode,
        temperature: options.temperature,
      });

      enhancedChunks.push(result.markdown);
      allCorrections.push(...result.corrections);
      totalInputTokens += result.stats.inputTokens;
      totalOutputTokens += result.stats.outputTokens;
    }

    const totalTime = (performance.now() - startTime) / 1000;
    const markdown = enhancedChunks.join("\n\n");

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
      },
      corrections: allCorrections,
    };
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.context !== null) {
      await this.context.dispose();
      this.context = null;
    }
    if (this.model !== null) {
      await this.model.dispose();
      this.model = null;
    }
    this.isInitialized = false;
  }
}

/**
 * Quick function to enhance a transcript
 */
export async function enhanceTranscript(
  rawTranscript: string,
  options: LLMProcessOptions = {}
): Promise<LLMProcessResult> {
  const processor = new LLMProcessor(options);

  try {
    await processor.initialize();
    return await processor.enhanceChunked(rawTranscript, {
      mode: options.mode,
    });
  } finally {
    await processor.dispose();
  }
}

