#!/usr/bin/env node

/**
 * cuttledoc CLI
 *
 * Usage:
 *   npx cuttledoc <audio-file> [options]
 *   npx cuttledoc models list
 *   npx cuttledoc models download <model>
 */

import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { basename } from "node:path"

import {
  transcribe,
  downloadModel,
  isModelDownloaded,
  BACKEND_TYPES,
  COREML_MODELS,
  LOCAL_MODELS,
  downloadLLMModel,
  isLLMModelDownloaded
} from "../index.js"
import { enhanceTranscript } from "@cuttledoc/llm"

import { parseArgs } from "./args.js"
import { runBenchmark } from "./benchmark.js"
import { printHelp, printModels, printStats, printStatus, printVersion } from "./output.js"
import { validateTranscribeArgs } from "./validation.js"

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  // Handle flags
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  if (args.version) {
    printVersion()
    process.exit(0)
  }

  // Handle subcommands
  if (args.command === "models") {
    await handleModelsCommand(args)
    return
  }

  if (args.command === "benchmark") {
    await runBenchmark(args.positional)
    return
  }

  // Default: transcribe command
  await handleTranscribeCommand(args)
}

async function handleModelsCommand(args: ReturnType<typeof parseArgs>): Promise<void> {
  const subcommand = args.positional[0]

  if (subcommand === "list" || subcommand === undefined) {
    // Convert CoreML models to simpler format for printModels
    const asrModels: Record<string, { description?: string }> = {}
    for (const [id, info] of Object.entries(COREML_MODELS)) {
      asrModels[id] = { description: `${info.name} - ${info.speed}` }
    }

    // Check download status
    const parakeetDownloaded = await isModelDownloaded(BACKEND_TYPES.parakeet)
    const whisperDownloaded = await isModelDownloaded(BACKEND_TYPES.whisper)

    printModels(
      asrModels,
      LOCAL_MODELS,
      (id) => (id === "parakeet" ? parakeetDownloaded : id === "whisper" ? whisperDownloaded : false),
      (id) => isLLMModelDownloaded(id as keyof typeof LOCAL_MODELS)
    )
    return
  }

  if (subcommand === "download") {
    const modelId = args.positional[1]
    if (modelId === undefined) {
      console.error("Error: Please specify a model to download")
      console.error("Usage: cuttledoc models download <model-id>")
      console.error("Available: parakeet, whisper, or LLM model names")
      process.exit(1)
    }

    // Try LLM models first
    if (modelId in LOCAL_MODELS) {
      console.log(`Downloading LLM model: ${modelId}...`)
      await downloadLLMModel(modelId as keyof typeof LOCAL_MODELS, {
        onProgress: (p) => {
          process.stdout.write(`\rProgress: ${(p * 100).toFixed(1)}%`)
        }
      })
      console.log("\nDone!")
      return
    }

    // Try ASR models (parakeet or whisper)
    if (modelId === "parakeet") {
      console.log("Downloading Parakeet CoreML models...")
      await downloadModel(BACKEND_TYPES.parakeet)
      console.log("Done!")
      return
    }

    if (modelId === "whisper") {
      console.log("Downloading Whisper CoreML models...")
      await downloadModel(BACKEND_TYPES.whisper)
      console.log("Done!")
      return
    }

    // Download all ASR models
    if (modelId === "all" || modelId === "asr") {
      console.log("Downloading all ASR models...")
      await downloadModel(BACKEND_TYPES.parakeet)
      await downloadModel(BACKEND_TYPES.whisper)
      console.log("Done!")
      return
    }

    console.error(`Unknown model: ${modelId}`)
    console.error("Run 'cuttledoc models list' to see available models")
    process.exit(1)
  }

  console.error(`Unknown subcommand: ${subcommand}`)
  console.error("Usage: cuttledoc models [list|download <model>]")
  process.exit(1)
}

export async function handleTranscribeCommand(args: ReturnType<typeof parseArgs>): Promise<void> {
  const inputFile = args.positional[0]

  if (inputFile === undefined) {
    console.error("Error: Please specify an audio/video file to transcribe")
    console.error("Usage: cuttledoc <file> [options]")
    console.error("Run 'cuttledoc --help' for more options")
    process.exit(1)
  }

  const validatedArgs = validateTranscribeArgs(args)

  if (!existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`)
    process.exit(1)
  }

  const startTime = performance.now()

  printStatus(`Transcribing: ${basename(inputFile)}`, args.quiet)
  printStatus(`Backend: ${validatedArgs.backend}`, args.quiet)

  // Run transcription
  const transcribeOptions: {
    backend: typeof validatedArgs.backend
    language?: string
    apiKey?: string
    model?: string
  } = { backend: validatedArgs.backend }
  if (args.language !== undefined) {
    transcribeOptions.language = args.language
  }
  if (args.apiKey !== undefined) {
    transcribeOptions.apiKey = args.apiKey
  }
  if (validatedArgs.speechModel !== undefined) {
    transcribeOptions.model = validatedArgs.speechModel
  }
  const result = await transcribe(inputFile, transcribeOptions)

  const transcribeTime = (performance.now() - startTime) / 1000
  let finalText = result.text

  // LLM processing (correction enabled by default)
  if (validatedArgs.llmModel !== undefined) {
    const llmModel = validatedArgs.llmModel
    const mode = args.format ? "format" : "correct"
    printStatus(`LLM ${mode}: ${llmModel}`, args.quiet)

    const enhanceOptions: {
      model: string
      mode: typeof mode
      provider?: "local" | "ollama" | "openai"
      apiKey?: string
    } = {
      model: llmModel,
      mode
    }
    if (validatedArgs.llmProvider !== undefined) enhanceOptions.provider = validatedArgs.llmProvider
    if (validatedArgs.llmProvider === "openai" && args.apiKey !== undefined) enhanceOptions.apiKey = args.apiKey

    const enhanced = await enhanceTranscript(result.text, enhanceOptions)

    finalText = enhanced.markdown

    printStatus(`LLM corrections: ${enhanced.stats.correctionsCount.toString()}`, args.quiet)
  }

  // Output
  const totalTime = (performance.now() - startTime) / 1000

  if (args.output !== undefined) {
    await writeFile(args.output, finalText, "utf-8")
    printStatus(`Output written to: ${args.output}`, args.quiet)
  } else if (!args.quiet) {
    console.log(`\n${"─".repeat(60)}\n`)
    console.log(finalText)
    console.log(`\n${"─".repeat(60)}`)
  } else {
    // Quiet mode: just output the text
    console.log(finalText)
  }

  // Stats
  if (args.stats && !args.quiet) {
    printStats({
      inputFile,
      durationSeconds: result.durationSeconds,
      transcribeTimeSeconds: transcribeTime,
      totalTimeSeconds: totalTime,
      backend: result.backend,
      wordCount: result.text.split(/\s+/).length,
      enhanced: validatedArgs.llmModel !== undefined
    })
  }
}

// Run as CLI entrypoint. Skipped under test (vitest sets VITEST) so the
// exported functions can be imported without triggering a full run.
if (process.env["VITEST"] === undefined) {
  main().catch((error: unknown) => {
    console.error("Error:", error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
