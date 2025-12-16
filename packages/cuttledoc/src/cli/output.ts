/* eslint-disable no-console */
/**
 * CLI output helpers
 */

/**
 * Print help message
 */
export function printHelp(): void {
  console.log(`
cuttledoc - Video to document transcription with AI

USAGE:
  cuttledoc <audio-file> [options]
  cuttledoc models [list|download <model>]

ARGUMENTS:
  <audio-file>      Audio or video file to transcribe (mp3, m4a, mp4, wav, etc.)

OPTIONS:
  -b, --backend <name>    Backend to use: auto, apple, sherpa (default: auto)
  -m, --model <name>      Speech model (e.g., whisper-medium, parakeet-tdt-0.6b-v3)
  -l, --language <code>   Language code (e.g., en, de, fr)
  -o, --output <file>     Write output to file instead of stdout
  -e, --enhance           Enhance transcript with LLM (formatting, corrections)
  --correct-only          Only fix transcription errors, no formatting
  --llm-model <name>      LLM model for enhancement (default: gemma3n:e4b)
  -s, --stats             Show processing statistics
  -q, --quiet             Minimal output (just the transcript)
  -h, --help              Show this help message
  -v, --version           Show version

EXAMPLES:
  # Basic transcription
  cuttledoc podcast.mp3

  # Transcribe with Apple backend and German language
  cuttledoc meeting.m4a -b apple -l de

  # Transcribe and enhance with LLM
  cuttledoc video.mp4 -e -o transcript.md

  # Download a speech model
  cuttledoc models download parakeet-tdt-0.6b-v3

  # List available models
  cuttledoc models list
`)
}

/**
 * Print version
 */
export function printVersion(): void {
  console.log("cuttledoc v0.1.0")
}

/**
 * Print available models
 */
export function printModels(
  sherpaModels: Record<string, { description?: string }>,
  llmModels: Record<string, { description: string }>,
  isSherpaDownloaded: (id: string) => boolean,
  isLLMDownloaded: (id: string) => boolean
): void {
  console.log("\n📢 SPEECH MODELS (sherpa-onnx)\n")
  console.log("  ID                           Downloaded   Description")
  console.log(`  ${"─".repeat(70)}`)

  for (const [id, info] of Object.entries(sherpaModels)) {
    const downloaded = isSherpaDownloaded(id) ? "✅" : "  "
    const desc = info.description ?? ""
    console.log(`  ${id.padEnd(28)} ${downloaded}           ${desc}`)
  }

  console.log("\n🤖 LLM MODELS (for enhancement)\n")
  console.log("  ID                           Downloaded   Description")
  console.log(`  ${"─".repeat(70)}`)

  for (const [id, info] of Object.entries(llmModels)) {
    const downloaded = isLLMDownloaded(id) ? "✅" : "  "
    console.log(`  ${id.padEnd(28)} ${downloaded}           ${info.description}`)
  }

  console.log("\nTo download a model:")
  console.log("  cuttledoc models download <model-id>\n")
}

/**
 * Print transcription statistics
 */
export function printStats(stats: {
  inputFile: string
  durationSeconds: number
  transcribeTimeSeconds: number
  totalTimeSeconds: number
  backend: string
  wordCount: number
  enhanced: boolean
}): void {
  const rtf = stats.durationSeconds / stats.transcribeTimeSeconds

  console.log("\n📊 STATISTICS\n")
  console.log(`  File:           ${stats.inputFile}`)
  console.log(`  Duration:       ${formatDuration(stats.durationSeconds)}`)
  console.log(`  Backend:        ${stats.backend}`)
  console.log(`  Words:          ${stats.wordCount.toString()}`)
  console.log(`  Processing:     ${stats.transcribeTimeSeconds.toFixed(1)}s`)
  console.log(`  Speed:          ${rtf.toFixed(1)}x realtime`)
  if (stats.enhanced) {
    console.log(`  Total time:     ${stats.totalTimeSeconds.toFixed(1)}s (with LLM)`)
  }
  console.log()
}

/**
 * Format seconds as HH:MM:SS
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h.toString()}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }
  return `${m.toString()}:${s.toString().padStart(2, "0")}`
}

