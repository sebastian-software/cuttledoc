/**
 * CLI output helpers
 */

import { formatDuration } from "../types/stats.js"

/**
 * Print help message
 */
export function printHelp(): void {
  console.log(`
cuttledoc - Video to document transcription with AI

USAGE:
  cuttledoc <audio-file> [options]
  cuttledoc models [list|download <model>]
  cuttledoc benchmark [run|report]

ARGUMENTS:
  <audio-file>      Audio or video file to transcribe (mp3, m4a, mp4, wav, etc.)

OPTIONS:
  -b, --backend <name>    Backend to use: auto, parakeet, whisper, openai (default: auto)
                          - parakeet: Fastest, 25 languages (en, de, fr, es, ...)
                          - whisper: Best quality, 99 languages (large-v3)
                          - openai: Cloud API, best quality, 50+ languages
  -m, --model <name>      OpenAI speech model (requires --backend openai):
                          - gpt-4o-transcribe (default)
                          - gpt-4o-mini-transcribe (faster/cheaper)
  --api-key <key>         OpenAI API key (or set OPENAI_API_KEY env var)
  -l, --language <code>   Language code (e.g., en, de, fr)
  -o, --output <file>     Write output to file instead of stdout
  -f, --format            Add formatting (paragraphs, headings, markdown)
  --no-correct            Disable LLM correction (raw STT output)
  --llm-model <name>      Ollama, embedded GGUF, or OpenAI correction model
                          (default: gemma3n:e4b)
  -s, --stats             Show processing statistics
  -q, --quiet             Minimal output (just the transcript)
  -h, --help              Show this help message
  -v, --version           Show version

LOCAL MODELS (offline, macOS Apple Silicon only):
  parakeet                160 MB, fastest (RTF 0.03), 25 languages
  whisper                 800 MB, best coverage (RTF 0.07), 99 languages

  Local backends use CoreML for hardware acceleration (Neural Engine + GPU).

CLOUD MODELS (requires OPENAI_API_KEY):
  gpt-4o-transcribe       Best quality, 50+ languages
  gpt-4o-mini-transcribe  Faster and cheaper, good quality

  See: https://openai.com/index/introducing-our-next-generation-audio-models/

EXAMPLES:
  # Basic transcription with LLM correction (default)
  cuttledoc podcast.mp3

  # Raw STT output without LLM correction
  cuttledoc podcast.mp3 --no-correct

  # With formatting (paragraphs, headings, markdown)
  cuttledoc video.mp4 -f -o transcript.md

  # Transcribe with Whisper for best quality
  cuttledoc meeting.m4a -b whisper

  # Transcribe with OpenAI cloud API (best quality)
  cuttledoc meeting.m4a -b openai --api-key sk-...
  # Or set OPENAI_API_KEY environment variable:
  export OPENAI_API_KEY=sk-...
  cuttledoc meeting.m4a -b openai

  # Download speech models
  cuttledoc models download parakeet
  cuttledoc models download whisper

  # List available models
  cuttledoc models list
`)
}

/**
 * Print version
 * Version is read from package.json at build time
 */
export function printVersion(): void {
  // Version injected by tsup at build time
  console.log(`cuttledoc v${process.env["npm_package_version"] ?? "1.0.0"}`)
}

/**
 * Print available models
 */
export function printModels(
  speechModels: Record<string, { description?: string }>,
  llmModels: Record<string, { description: string }>,
  isSpeechDownloaded: (id: string) => boolean,
  isLLMDownloaded: (id: string) => boolean
): void {
  console.log("\n📢 SPEECH MODELS (CoreML)\n")
  console.log("  ID                           Downloaded   Description")
  console.log(`  ${"─".repeat(70)}`)

  for (const [id, info] of Object.entries(speechModels)) {
    const downloaded = isSpeechDownloaded(id) ? "✅" : "  "
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
