#!/usr/bin/env npx tsx
/**
 * Benchmark all supported STT backends against FLEURS samples
 *
 * Usage:
 *   pnpm benchmark              # Run all backends
 *   pnpm benchmark --local      # Only local backends (no API key needed)
 *   pnpm benchmark --cloud      # Only cloud backends (requires OPENAI_API_KEY)
 *   pnpm benchmark --backend=whisper  # Specific backend
 *
 * Prerequisites:
 *   - FLEURS fixtures downloaded: pnpm --filter cuttledoc fixtures:download
 *   - Models downloaded: cuttledoc models download parakeet-tdt-0.6b-v3
 *   - For cloud: OPENAI_API_KEY environment variable set
 */

import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { execSync, spawnSync } from "node:child_process"
import { tmpdir } from "node:os"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const FIXTURES_DIR = join(__dirname, "..", "fixtures")
const BIN_PATH = join(__dirname, "..", "bin", "cuttledoc.js")
const LANGUAGES = ["en", "es", "de", "fr", "pt"] as const

type Language = (typeof LANGUAGES)[number]

interface BenchmarkResult {
  backend: string
  language: Language
  samples: number
  avgWER: number
  avgRTF: number
  errors: number
}

interface BackendConfig {
  name: string
  type: "local" | "cloud"
  backendId: string
  model?: string
}

const BACKENDS: BackendConfig[] = [
  { name: "Parakeet v3", type: "local", backendId: "parakeet" },
  { name: "Whisper large-v3", type: "local", backendId: "whisper" },
  { name: "gpt-4o-transcribe", type: "cloud", backendId: "openai", model: "gpt-4o-transcribe" },
  { name: "gpt-4o-mini-transcribe", type: "cloud", backendId: "openai", model: "gpt-4o-mini-transcribe" }
]

// Temp directory for WAV conversions
let tempDir: string | null = null

/**
 * Convert OGG to WAV using system ffmpeg
 */
function convertToWav(oggPath: string): string {
  if (!tempDir) {
    tempDir = mkdtempSync(join(tmpdir(), "cuttledoc-benchmark-"))
  }

  const wavPath = join(tempDir, basename(oggPath).replace(".ogg", ".wav"))

  // Skip if already converted
  if (existsSync(wavPath)) {
    return wavPath
  }

  try {
    execSync(`ffmpeg -i "${oggPath}" -ar 16000 -ac 1 -y "${wavPath}" 2>/dev/null`, {
      encoding: "utf-8"
    })
    return wavPath
  } catch {
    throw new Error(`Failed to convert ${oggPath} to WAV. Is ffmpeg installed?`)
  }
}

/**
 * Cleanup temp directory
 */
function cleanupTemp(): void {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  }
}

/**
 * Calculate Word Error Rate between reference and hypothesis
 */
function calculateWER(reference: string, hypothesis: string): number {
  const normalize = (text: string): string[] =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter((w) => w.length > 0)

  const refWords = normalize(reference)
  const hypWords = normalize(hypothesis)

  const m = refWords.length
  const n = hypWords.length

  if (m === 0) return hypWords.length > 0 ? 100 : 0

  // Levenshtein distance with dynamic programming
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (refWords[i - 1] === hypWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  return (dp[m][n] / m) * 100
}

/**
 * Load fixtures for a language
 */
function loadFixtures(language: Language): Array<{ audioPath: string; reference: string }> {
  const fixtures: Array<{ audioPath: string; reference: string }> = []

  if (!existsSync(FIXTURES_DIR)) {
    return fixtures
  }

  const files = readdirSync(FIXTURES_DIR).filter((f) => f.startsWith(`fleurs-${language}-`) && f.endsWith(".ogg"))

  for (const file of files) {
    const audioPath = join(FIXTURES_DIR, file)
    const refPath = audioPath.replace(".ogg", ".txt")

    if (existsSync(refPath)) {
      const reference = readFileSync(refPath, "utf-8").trim()
      fixtures.push({ audioPath, reference })
    }
  }

  return fixtures
}

/**
 * Transcribe using OpenAI API directly (for cloud backends)
 */
async function transcribeWithOpenAI(
  audioPath: string,
  model: string,
  apiKey: string
): Promise<{ text: string; processingTime: number }> {
  const audioData = readFileSync(audioPath)
  const blob = new Blob([audioData], { type: "audio/ogg" })

  const formData = new FormData()
  formData.append("file", blob, basename(audioPath))
  formData.append("model", model)
  formData.append("response_format", "json")

  const startTime = performance.now()

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  })

  const processingTime = (performance.now() - startTime) / 1000

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const result = (await response.json()) as { text: string }
  return { text: result.text, processingTime }
}

/**
 * Transcribe using local backend via CLI
 */
function transcribeWithCLI(
  audioPath: string,
  backend: string,
  language: string
): { text: string; processingTime: number } {
  const startTime = performance.now()

  const result = spawnSync("node", [BIN_PATH, audioPath, "-b", backend, "-l", language, "-q"], {
    encoding: "utf-8",
    timeout: 120000, // 2 minute timeout
    env: { ...process.env }
  })

  const processingTime = (performance.now() - startTime) / 1000

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `Exit code: ${String(result.status)}`)
  }

  return { text: result.stdout.trim(), processingTime }
}

/**
 * Benchmark a single backend
 */
async function benchmarkBackend(config: BackendConfig, apiKey?: string): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = []

  console.log(`\n${"=".repeat(60)}`)
  console.log(`Benchmarking: ${config.name}`)
  console.log("=".repeat(60))

  for (const language of LANGUAGES) {
    const fixtures = loadFixtures(language)

    if (fixtures.length === 0) {
      console.log(`  ${language.toUpperCase()}: No fixtures found`)
      continue
    }

    let totalWER = 0
    let totalRTF = 0
    let successCount = 0
    let errorCount = 0

    console.log(`  ${language.toUpperCase()}: ${fixtures.length} samples`)

    for (const { audioPath, reference } of fixtures) {
      try {
        let text: string
        let processingTime: number

        if (config.type === "cloud" && apiKey) {
          // Cloud backends can handle OGG directly
          const result = await transcribeWithOpenAI(audioPath, config.model!, apiKey)
          text = result.text
          processingTime = result.processingTime
        } else {
          // Local backends need WAV - convert OGG first
          const wavPath = convertToWav(audioPath)
          const result = transcribeWithCLI(wavPath, config.backendId, language)
          text = result.text
          processingTime = result.processingTime
        }

        // Estimate audio duration (FLEURS samples are ~10s on average)
        const audioDuration = 10
        const rtf = processingTime / audioDuration

        const wer = calculateWER(reference, text)

        totalWER += wer
        totalRTF += rtf
        successCount++

        process.stdout.write(".")
      } catch (error) {
        process.stdout.write("X")
        errorCount++
        if (process.env["DEBUG"]) {
          console.error(`\n  Error: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }

    console.log() // New line after dots

    if (successCount > 0) {
      results.push({
        backend: config.name,
        language,
        samples: successCount,
        avgWER: totalWER / successCount,
        avgRTF: totalRTF / successCount,
        errors: errorCount
      })

      console.log(`    → WER: ${(totalWER / successCount).toFixed(1)}%, RTF: ${(totalRTF / successCount).toFixed(2)}`)
    }
  }

  return results
}

/**
 * Print summary table
 */
function printSummary(allResults: BenchmarkResult[]): void {
  console.log("\n" + "=".repeat(80))
  console.log("BENCHMARK SUMMARY")
  console.log("=".repeat(80))

  // Group by backend
  const backends = [...new Set(allResults.map((r) => r.backend))]

  // Header
  console.log("\n### Word Error Rate (WER) - Lower is Better\n")
  console.log(`| Backend | ${LANGUAGES.map((l) => `${l.toUpperCase()}`).join(" | ")} | Avg WER | RTF |`)
  console.log(`| ${"-".repeat(25)} | ${LANGUAGES.map(() => "-----").join(" | ")} | ------- | ---- |`)

  for (const backend of backends) {
    const backendResults = allResults.filter((r) => r.backend === backend)
    const langValues = LANGUAGES.map((lang) => {
      const result = backendResults.find((r) => r.language === lang)
      return result ? `${result.avgWER.toFixed(1)}%` : "N/A"
    })

    const avgWER =
      backendResults.length > 0 ? backendResults.reduce((sum, r) => sum + r.avgWER, 0) / backendResults.length : 0

    const avgRTF =
      backendResults.length > 0 ? backendResults.reduce((sum, r) => sum + r.avgRTF, 0) / backendResults.length : 0

    console.log(`| **${backend}** | ${langValues.join(" | ")} | ${avgWER.toFixed(1)}% | ${avgRTF.toFixed(2)} |`)
  }

  // Ranking
  console.log("\n### 🏆 Ranking by Average WER\n")

  const avgByBackend = backends.map((backend) => {
    const results = allResults.filter((r) => r.backend === backend)
    return {
      backend,
      avgWER: results.reduce((sum, r) => sum + r.avgWER, 0) / results.length,
      avgRTF: results.reduce((sum, r) => sum + r.avgRTF, 0) / results.length
    }
  })

  avgByBackend.sort((a, b) => a.avgWER - b.avgWER)

  console.log("| Rank | Backend | Avg WER | Avg RTF |")
  console.log("| ---- | ------- | ------- | ------- |")

  avgByBackend.forEach((item, index) => {
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`
    console.log(`| ${medal} | **${item.backend}** | ${item.avgWER.toFixed(1)}% | ${item.avgRTF.toFixed(2)} |`)
  })
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      local: { type: "boolean", default: false },
      cloud: { type: "boolean", default: false },
      backend: { type: "string" },
      help: { type: "boolean", short: "h", default: false }
    }
  })

  if (values.help) {
    console.log(`
Usage: pnpm benchmark [options]

Options:
  --local           Only run local backends (Parakeet, Whisper)
  --cloud           Only run cloud backends (requires OPENAI_API_KEY)
  --backend=NAME    Run specific backend (parakeet, whisper, gpt-4o-transcribe, gpt-4o-mini-transcribe)
  -h, --help        Show this help

Environment:
  OPENAI_API_KEY    Required for cloud backends
  DEBUG=1           Show detailed error messages

Prerequisites:
  1. Download fixtures: pnpm --filter cuttledoc fixtures:download
  2. Download models: cuttledoc models download parakeet-tdt-0.6b-v3
  3. For cloud: export OPENAI_API_KEY=sk-...
`)
    return
  }

  // Check fixtures exist
  if (!existsSync(FIXTURES_DIR)) {
    console.error(`Error: Fixtures directory not found: ${FIXTURES_DIR}`)
    console.error("Run: pnpm --filter cuttledoc fixtures:download")
    process.exit(1)
  }

  const sampleCount = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".ogg")).length
  if (sampleCount === 0) {
    console.error("Error: No audio fixtures found")
    console.error("Run: pnpm --filter cuttledoc fixtures:download")
    process.exit(1)
  }

  console.log(`Found ${sampleCount} audio samples in ${FIXTURES_DIR}`)

  // Filter backends
  let backendsToRun = BACKENDS

  if (values.backend) {
    const backendName = values.backend.toLowerCase()
    backendsToRun = BACKENDS.filter((b) => b.backendId === backendName || b.name.toLowerCase().includes(backendName))
    if (backendsToRun.length === 0) {
      console.error(`Unknown backend: ${values.backend}`)
      console.error(`Available: ${BACKENDS.map((b) => b.name).join(", ")}`)
      process.exit(1)
    }
  } else if (values.local) {
    backendsToRun = BACKENDS.filter((b) => b.type === "local")
  } else if (values.cloud) {
    backendsToRun = BACKENDS.filter((b) => b.type === "cloud")
  }

  // Check API key for cloud backends
  const hasCloudBackends = backendsToRun.some((b) => b.type === "cloud")
  const apiKey = process.env["OPENAI_API_KEY"]
  if (hasCloudBackends && !apiKey) {
    console.error("Error: OPENAI_API_KEY required for cloud backends")
    console.error("Set it or use --local to skip cloud backends")
    process.exit(1)
  }

  console.log(`\nRunning benchmarks for: ${backendsToRun.map((b) => b.name).join(", ")}`)

  // Run benchmarks
  const allResults: BenchmarkResult[] = []

  for (const backend of backendsToRun) {
    try {
      const results = await benchmarkBackend(backend, apiKey)
      allResults.push(...results)
    } catch (error) {
      console.error(`\nError benchmarking ${backend.name}:`, error)
    }
  }

  // Print summary
  if (allResults.length > 0) {
    printSummary(allResults)
  }

  // Cleanup temp files
  cleanupTemp()

  console.log("\nBenchmark complete!")
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
