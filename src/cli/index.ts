#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * local-transcribe CLI
 *
 * Usage:
 *   npx local-transcribe <audio-file> [options]
 *   npx local-transcribe models list
 *   npx local-transcribe models download <model>
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";

import { parseArgs } from "./args.js";
import { printHelp, printModels, printStats, printVersion } from "./output.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Handle flags
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    printVersion();
    process.exit(0);
  }

  // Handle subcommands
  if (args.command === "models") {
    await handleModelsCommand(args);
    return;
  }

  // Default: transcribe command
  await handleTranscribeCommand(args);
}

async function handleModelsCommand(args: ReturnType<typeof parseArgs>): Promise<void> {
  const subcommand = args.positional[0];

  if (subcommand === "list" || subcommand === undefined) {
    const { LLM_MODELS } = await import("../llm/types.js");
    const { SHERPA_MODELS } = await import("../backends/sherpa/types.js");
    const { isModelDownloaded: isLLMDownloaded } = await import("../llm/processor.js");
    const { isModelDownloaded: isSherpaDownloaded } = await import("../backends/sherpa/download.js");

    // Convert to simpler format for printModels
    const sherpaModelsSimple: Record<string, { description?: string }> = {};
    for (const [id, info] of Object.entries(SHERPA_MODELS)) {
      sherpaModelsSimple[id] = { description: info.languages.join(", ") };
    }

    printModels(
      sherpaModelsSimple,
      LLM_MODELS,
      (id) => isSherpaDownloaded(id as keyof typeof SHERPA_MODELS),
      (id) => isLLMDownloaded(id as keyof typeof LLM_MODELS)
    );
    return;
  }

  if (subcommand === "download") {
    const modelId = args.positional[1];
    if (modelId === undefined) {
      console.error("Error: Please specify a model to download");
      console.error("Usage: local-transcribe models download <model-id>");
      process.exit(1);
    }

    // Try LLM models first
    const { LLM_MODELS } = await import("../llm/types.js");
    if (modelId in LLM_MODELS) {
      const { downloadModel } = await import("../llm/processor.js");
      console.log(`Downloading LLM model: ${modelId}...`);
      await downloadModel(modelId as keyof typeof LLM_MODELS, {
        onProgress: (p) => {
          process.stdout.write(`\rProgress: ${(p * 100).toFixed(1)}%`);
        },
      });
      console.log("\nDone!");
      return;
    }

    // Try Sherpa models
    const { SHERPA_MODELS } = await import("../backends/sherpa/types.js");
    if (modelId in SHERPA_MODELS) {
      const { downloadSherpaModel } = await import("../backends/sherpa/download.js");
      console.log(`Downloading speech model: ${modelId}...`);
      await downloadSherpaModel(modelId, {
        onProgress: ({ downloaded, total }) => {
          const pct = total > 0 ? (downloaded / total) * 100 : 0;
          process.stdout.write(`\rProgress: ${pct.toFixed(1)}%`);
        },
      });
      console.log("\nDone!");
      return;
    }

    console.error(`Unknown model: ${modelId}`);
    console.error("Run 'local-transcribe models list' to see available models");
    process.exit(1);
  }

  console.error(`Unknown subcommand: ${subcommand}`);
  console.error("Usage: local-transcribe models [list|download <model>]");
  process.exit(1);
}

async function handleTranscribeCommand(args: ReturnType<typeof parseArgs>): Promise<void> {
  const inputFile = args.positional[0];

  if (inputFile === undefined) {
    console.error("Error: Please specify an audio/video file to transcribe");
    console.error("Usage: local-transcribe <file> [options]");
    console.error("Run 'local-transcribe --help' for more options");
    process.exit(1);
  }

  if (!existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  // Import transcribe function
  const { transcribe } = await import("../index.js");
  const startTime = performance.now();

  console.log(`Transcribing: ${basename(inputFile)}`);
  console.log(`Backend: ${args.backend ?? "auto"}`);

  // Import types
  const { BACKEND_TYPES } = await import("../types.js");
  type BackendType = keyof typeof BACKEND_TYPES;

  // Validate backend
  const backendArg = args.backend ?? "auto";
  const backend = backendArg in BACKEND_TYPES
    ? (backendArg as BackendType)
    : "auto";

  // Run transcription
  const transcribeOptions: { backend: BackendType; language?: string } = { backend };
  if (args.language !== undefined) {
    transcribeOptions.language = args.language;
  }
  const result = await transcribe(inputFile, transcribeOptions);

  const transcribeTime = (performance.now() - startTime) / 1000;
  let finalText = result.text;

  // Enhance with LLM if requested
  if (args.enhance) {
    const llmModel = args.llmModel ?? "gemma3n:e4b";
    console.log(`Enhancing with LLM: ${llmModel}`);

    const { enhanceTranscript } = await import("../llm/processor.js");
    const { LLM_MODELS } = await import("../llm/types.js");

    // Validate model
    const modelId = llmModel in LLM_MODELS
      ? (llmModel as keyof typeof LLM_MODELS)
      : "gemma3n:e4b";

    const enhanced = await enhanceTranscript(result.text, {
      model: modelId,
      mode: args.correctOnly ? "correct" : "enhance",
    });

    finalText = enhanced.markdown;

    if (!args.quiet) {
      console.log(`LLM corrections: ${enhanced.stats.correctionsCount.toString()}`);
    }
  }

  // Output
  const totalTime = (performance.now() - startTime) / 1000;

  if (args.output !== undefined) {
    await writeFile(args.output, finalText, "utf-8");
    console.log(`Output written to: ${args.output}`);
  } else if (!args.quiet) {
    console.log(`\n${  "─".repeat(60)  }\n`);
    console.log(finalText);
    console.log(`\n${  "─".repeat(60)}`);
  } else {
    // Quiet mode: just output the text
    console.log(finalText);
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
      enhanced: args.enhance,
    });
  }
}

// Run
main().catch((error: unknown) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

