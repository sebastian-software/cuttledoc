#!/usr/bin/env npx tsx
/**
 * LLM Correction Benchmark
 *
 * Tests different Ollama models on transcript correction quality.
 *
 * Prerequisites:
 *   1. Download VoxPopuli samples: python fixtures/download-voxpopuli.py
 *   2. Start Ollama: ollama serve
 *   3. Pull models: ollama pull gemma3n:e4b qwen2.5:7b mistral:7b
 *
 * Usage:
 *   pnpm benchmark              # Run full benchmark
 *   pnpm benchmark --model gemma3n:e4b  # Single model
 */

import { execSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
// Use FLEURS samples from cuttledoc package (already downloaded)
const FIXTURES_DIR = join(__dirname, "..", "..", "cuttledoc", "fixtures")
const RESULTS_DIR = join(__dirname, "..", "results")

// Models to benchmark
const MODELS = ["gemma3n:latest", "qwen2.5:7b", "mistral:7b"]

// Limit samples per language for faster benchmarks
const MAX_SAMPLES_PER_LANG = 3

// Languages
const LANGUAGES = ["en", "de", "fr", "es", "pt"]

interface BenchmarkResult {
  model: string
  language: string
  sampleId: string
  werBefore: number
  werAfter: number
  werImprovement: number
  tokensPerSecond: number
  processingTimeMs: number
  inputWords: number
  outputWords: number
}

/**
 * Calculate Word Error Rate between reference and hypothesis
 */
function calculateWER(reference: string, hypothesis: string): number {
  const refWords = reference.toLowerCase().split(/\s+/).filter(Boolean)
  const hypWords = hypothesis.toLowerCase().split(/\s+/).filter(Boolean)

  if (refWords.length === 0) return hypWords.length > 0 ? 1 : 0

  // Levenshtein distance at word level
  const m = refWords.length
  const n = hypWords.length
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

  return dp[m][n] / m
}

/**
 * Check if Ollama is running
 */
async function isOllamaRunning(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(2000)
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Check if a model is available in Ollama
 */
async function hasModel(model: string): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:11434/api/tags")
    if (!response.ok) return false
    const data = (await response.json()) as { models: { name: string }[] }
    return data.models.some((m) => m.name.startsWith(model.split(":")[0]))
  } catch {
    return false
  }
}

/**
 * Correct text using Ollama
 */
async function correctWithOllama(
  text: string,
  model: string
): Promise<{ corrected: string; tokensPerSecond: number; processingTimeMs: number }> {
  const prompt = `Fix this speech-to-text transcript in three steps:

1. GRAMMAR: Check if sentences are grammatically correct. Fix word boundaries by splitting or merging words/word parts where needed.

2. PUNCTUATION: Fix commas, periods, and other punctuation marks.

3. CAPITALIZATION: Apply correct capitalization rules for the target language.

Output ONLY the corrected text, nothing else.

Transcript:
${text}`

  const startTime = performance.now()

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.3 }
    }),
    signal: AbortSignal.timeout(300_000)
  })

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`)
  }

  const data = (await response.json()) as {
    response: string
    eval_count?: number
    eval_duration?: number
  }

  const processingTimeMs = performance.now() - startTime
  const tokensPerSecond =
    data.eval_count !== undefined && data.eval_duration !== undefined ? data.eval_count / (data.eval_duration / 1e9) : 0

  return {
    corrected: data.response.trim(),
    tokensPerSecond,
    processingTimeMs
  }
}

/**
 * Transcribe audio file using cuttledoc CLI
 */
function transcribeAudio(audioPath: string): string {
  const cuttledocBin = join(__dirname, "..", "..", "cuttledoc", "bin", "cuttledoc.js")

  // Convert OGG to WAV if needed
  let wavPath = audioPath
  if (audioPath.endsWith(".ogg")) {
    wavPath = audioPath.replace(".ogg", ".wav")
    if (!existsSync(wavPath)) {
      spawnSync("ffmpeg", ["-i", audioPath, "-ar", "16000", "-ac", "1", wavPath, "-y"], {
        stdio: "pipe"
      })
    }
  }

  try {
    const result = execSync(`node "${cuttledocBin}" transcribe "${wavPath}" --backend parakeet`, {
      encoding: "utf-8",
      timeout: 120000
    })
    return result.trim()
  } catch (error) {
    console.error(`  Error transcribing ${audioPath}:`, error)
    return ""
  }
}

/**
 * Find all FLEURS samples
 */
function findSamples(): { lang: string; id: string; audioPath: string; refPath: string }[] {
  const samples: { lang: string; id: string; audioPath: string; refPath: string }[] = []

  if (!existsSync(FIXTURES_DIR)) {
    return samples
  }

  const files = readdirSync(FIXTURES_DIR)

  for (const file of files) {
    const match = file.match(/^fleurs-(\w+)-(\d+)\.ogg$/)
    if (match) {
      const [, lang, id] = match
      const refPath = join(FIXTURES_DIR, `fleurs-${lang}-${id}.txt`)
      if (existsSync(refPath)) {
        samples.push({
          lang: lang!,
          id: id!,
          audioPath: join(FIXTURES_DIR, file),
          refPath
        })
      }
    }
  }

  // Sort and limit samples per language
  const sorted = samples.sort((a, b) => `${a.lang}-${a.id}`.localeCompare(`${b.lang}-${b.id}`))

  // Limit to MAX_SAMPLES_PER_LANG per language
  const limited: typeof samples = []
  const countByLang = new Map<string, number>()
  for (const sample of sorted) {
    const count = countByLang.get(sample.lang) ?? 0
    if (count < MAX_SAMPLES_PER_LANG) {
      limited.push(sample)
      countByLang.set(sample.lang, count + 1)
    }
  }
  return limited
}

/**
 * Run benchmark for a single model
 */
async function benchmarkModel(model: string, samples: ReturnType<typeof findSamples>): Promise<BenchmarkResult[]> {
  console.log(`\n📊 Benchmarking ${model}...`)
  const results: BenchmarkResult[] = []

  for (const sample of samples) {
    const reference = readFileSync(sample.refPath, "utf-8").trim()

    // Get raw STT output (cached if available)
    const sttCachePath = join(RESULTS_DIR, `stt-${sample.lang}-${sample.id}.txt`)
    let rawTranscript: string

    if (existsSync(sttCachePath)) {
      rawTranscript = readFileSync(sttCachePath, "utf-8")
    } else {
      console.log(`  Transcribing ${sample.lang}-${sample.id}...`)
      rawTranscript = transcribeAudio(sample.audioPath)
      writeFileSync(sttCachePath, rawTranscript)
    }

    if (!rawTranscript) {
      console.log(`  ⚠️ Skipping ${sample.lang}-${sample.id} (no transcript)`)
      continue
    }

    // Calculate WER before correction
    const werBefore = calculateWER(reference, rawTranscript)

    // Correct with LLM
    console.log(`  Correcting ${sample.lang}-${sample.id} with ${model}...`)
    try {
      const { corrected, tokensPerSecond, processingTimeMs } = await correctWithOllama(rawTranscript, model)

      // Calculate WER after correction
      const werAfter = calculateWER(reference, corrected)
      const werImprovement = werBefore > 0 ? ((werBefore - werAfter) / werBefore) * 100 : 0

      results.push({
        model,
        language: sample.lang,
        sampleId: sample.id,
        werBefore,
        werAfter,
        werImprovement,
        tokensPerSecond,
        processingTimeMs,
        inputWords: rawTranscript.split(/\s+/).length,
        outputWords: corrected.split(/\s+/).length
      })

      // Save corrected output
      const correctedPath = join(RESULTS_DIR, `${model.replace(":", "-")}-${sample.lang}-${sample.id}.txt`)
      writeFileSync(correctedPath, corrected)

      console.log(
        `    WER: ${(werBefore * 100).toFixed(1)}% → ${(werAfter * 100).toFixed(1)}% ` +
          `(${werImprovement > 0 ? "+" : ""}${werImprovement.toFixed(1)}% improvement)`
      )
    } catch (error) {
      console.error(`  ❌ Error with ${model}:`, error)
    }
  }

  return results
}

/**
 * Print summary table
 */
function printSummary(allResults: BenchmarkResult[]) {
  console.log("\n" + "=".repeat(80))
  console.log("📊 BENCHMARK SUMMARY")
  console.log("=".repeat(80))

  // Group by model
  const byModel = new Map<string, BenchmarkResult[]>()
  for (const r of allResults) {
    if (!byModel.has(r.model)) byModel.set(r.model, [])
    byModel.get(r.model)!.push(r)
  }

  // Print per-model stats
  console.log("\n### Overall Performance\n")
  console.log("| Model | Avg WER Before | Avg WER After | Improvement | Speed (tok/s) |")
  console.log("|-------|----------------|---------------|-------------|---------------|")

  const modelStats: { model: string; avgImprovement: number; avgSpeed: number }[] = []

  for (const [model, results] of byModel) {
    const avgWerBefore = results.reduce((sum, r) => sum + r.werBefore, 0) / results.length
    const avgWerAfter = results.reduce((sum, r) => sum + r.werAfter, 0) / results.length
    const avgImprovement = results.reduce((sum, r) => sum + r.werImprovement, 0) / results.length
    const avgSpeed = results.reduce((sum, r) => sum + r.tokensPerSecond, 0) / results.length

    modelStats.push({ model, avgImprovement, avgSpeed })

    console.log(
      `| ${model.padEnd(13)} | ${(avgWerBefore * 100).toFixed(1).padStart(12)}% | ` +
        `${(avgWerAfter * 100).toFixed(1).padStart(11)}% | ` +
        `${(avgImprovement > 0 ? "+" : "") + avgImprovement.toFixed(1).padStart(10)}% | ` +
        `${avgSpeed.toFixed(0).padStart(13)} |`
    )
  }

  // Print per-language stats
  console.log("\n### Per-Language WER Improvement\n")
  console.log("| Model | EN | DE | FR | ES | PT |")
  console.log("|-------|----|----|----|----|------|")

  for (const [model, results] of byModel) {
    const byLang = new Map<string, number[]>()
    for (const r of results) {
      if (!byLang.has(r.language)) byLang.set(r.language, [])
      byLang.get(r.language)!.push(r.werImprovement)
    }

    const langAvgs = LANGUAGES.map((lang) => {
      const improvements = byLang.get(lang) ?? []
      return improvements.length > 0 ? improvements.reduce((a, b) => a + b, 0) / improvements.length : 0
    })

    console.log(
      `| ${model.padEnd(13)} | ` +
        langAvgs.map((avg) => `${(avg > 0 ? "+" : "") + avg.toFixed(0)}%`.padStart(3)).join(" | ") +
        " |"
    )
  }

  // Recommendation
  console.log("\n### Recommendation\n")
  const bestQuality = modelStats.sort((a, b) => b.avgImprovement - a.avgImprovement)[0]
  const bestSpeed = modelStats.sort((a, b) => b.avgSpeed - a.avgSpeed)[0]

  console.log(
    `🏆 **Best Quality**: ${bestQuality?.model} (+${bestQuality?.avgImprovement.toFixed(1)}% WER improvement)`
  )
  console.log(`⚡ **Best Speed**: ${bestSpeed?.model} (${bestSpeed?.avgSpeed.toFixed(0)} tokens/sec)`)

  if (bestQuality?.model === bestSpeed?.model) {
    console.log(`\n✅ **Recommended Default**: ${bestQuality?.model}`)
  } else {
    console.log(`\n💡 Consider ${bestQuality?.model} for quality, ${bestSpeed?.model} for speed`)
  }
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2)
  const modelArg = args.find((a) => a.startsWith("--model="))?.split("=")[1]
  const modelsToTest = modelArg ? [modelArg] : MODELS

  // Check Ollama
  if (!(await isOllamaRunning())) {
    console.error("❌ Ollama is not running. Start with: ollama serve")
    process.exit(1)
  }

  // Check models
  for (const model of modelsToTest) {
    if (!(await hasModel(model))) {
      console.error(`❌ Model ${model} not found. Pull with: ollama pull ${model}`)
      process.exit(1)
    }
  }

  // Find samples
  const samples = findSamples()
  if (samples.length === 0) {
    console.error("❌ No FLEURS samples found. Download with:")
    console.error("   cd packages/cuttledoc/fixtures && python download-samples.py")
    process.exit(1)
  }

  console.log(`Found ${samples.length} samples across ${new Set(samples.map((s) => s.lang)).size} languages`)

  // Create results directory
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true })
  }

  // Run benchmarks
  const allResults: BenchmarkResult[] = []
  for (const model of modelsToTest) {
    const results = await benchmarkModel(model, samples)
    allResults.push(...results)
  }

  // Print summary
  if (allResults.length > 0) {
    printSummary(allResults)

    // Save results as JSON
    const jsonPath = join(RESULTS_DIR, "benchmark-results.json")
    writeFileSync(jsonPath, JSON.stringify(allResults, null, 2))
    console.log(`\n📁 Results saved to ${jsonPath}`)
  }
}

main().catch(console.error)
