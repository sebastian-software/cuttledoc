#!/usr/bin/env npx tsx
/**
 * Real LLM Correction Benchmark
 *
 * Uses actual STT outputs from Parakeet to test LLM correction quality.
 * Tests all 5 primary languages: EN, DE, FR, ES, PT
 *
 * Usage:
 *   cd packages/llm && npx tsx scripts/benchmark-real.ts
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { TRANSCRIPT_CORRECTION_PROMPT } from "../src/types.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = join(__dirname, "..", "..", "..")
const FIXTURES_DIR = join(WORKSPACE_ROOT, "packages", "cuttledoc", "fixtures")
const RESULTS_DIR = join(__dirname, "..", "results")
const STT_CACHE_DIR = join(RESULTS_DIR, "stt-cache")

// Models to benchmark
const MODELS = ["gemma3n:e4b", "phi4:14b", "gpt-oss:20b", "qwen2.5:7b", "mistral:7b"]
const LANGUAGES = ["en", "de", "fr", "es", "pt"]
const SAMPLES_PER_LANG = 10 // Use all 10 samples per language = 50 total

interface Result {
  model: string
  language: string
  sampleId: string
  reference: string
  sttOutput: string
  corrected: string
  werBefore: number
  werAfter: number
  improvement: number
  tokensPerSec: number
  timeMs: number
}

/**
 * Calculate Word Error Rate
 */
function calculateWER(reference: string, hypothesis: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
  const ref = normalize(reference)
  const hyp = normalize(hypothesis)

  if (ref.length === 0) return hyp.length > 0 ? 1 : 0

  const m = ref.length,
    n = hyp.length
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        ref[i - 1] === hyp[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n] / m
}

/**
 * Transcribe audio file using cuttledoc CLI
 */
function transcribeAudio(audioPath: string, cacheKey: string): string {
  const cachePath = join(STT_CACHE_DIR, `${cacheKey}.txt`)

  // Return cached result if exists
  if (existsSync(cachePath)) {
    return readFileSync(cachePath, "utf-8")
  }

  console.log(`    📝 Transcribing ${cacheKey}...`)

  const cuttledocBin = join(WORKSPACE_ROOT, "packages", "cuttledoc", "bin", "cuttledoc.js")

  try {
    const result = execSync(`node "${cuttledocBin}" "${audioPath}" --backend parakeet`, {
      encoding: "utf-8",
      timeout: 120000,
      cwd: WORKSPACE_ROOT,
      stdio: ["pipe", "pipe", "pipe"]
    })

    // Extract just the transcript (between the separator lines)
    const lines = result.split("\n")
    const startIdx = lines.findIndex((l) => l.includes("────"))
    const endIdx = lines.findLastIndex((l) => l.includes("────"))

    let transcript = ""
    if (startIdx >= 0 && endIdx > startIdx) {
      transcript = lines
        .slice(startIdx + 1, endIdx)
        .join("\n")
        .trim()
    } else {
      transcript = result.trim()
    }

    // Cache the result
    writeFileSync(cachePath, transcript)
    return transcript
  } catch (error) {
    console.error(`    ❌ Transcription failed: ${error}`)
    return ""
  }
}

/**
 * Correct text with Ollama using the improved prompt
 */
async function correctWithOllama(
  text: string,
  model: string
): Promise<{ corrected: string; tokensPerSec: number; timeMs: number }> {
  const prompt = `${TRANSCRIPT_CORRECTION_PROMPT}
${text}`

  const start = performance.now()

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.2 }
    }),
    signal: AbortSignal.timeout(90000) // 90 second timeout
  })

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`)
  }

  const data = (await response.json()) as { response: string; eval_count?: number; eval_duration?: number }
  const timeMs = performance.now() - start
  const tokensPerSec = data.eval_count && data.eval_duration ? data.eval_count / (data.eval_duration / 1e9) : 0

  return { corrected: data.response.trim(), tokensPerSec, timeMs }
}

/**
 * Find FLEURS samples
 */
function findSamples(): { lang: string; id: string; audioPath: string; refPath: string }[] {
  const samples: { lang: string; id: string; audioPath: string; refPath: string }[] = []
  const files = readdirSync(FIXTURES_DIR)
  const countByLang = new Map<string, number>()

  for (const file of files.sort()) {
    const match = file.match(/^fleurs-(\w+)-(\d+)\.ogg$/)
    if (match && LANGUAGES.includes(match[1])) {
      const [, lang, id] = match
      const count = countByLang.get(lang!) ?? 0

      if (count < SAMPLES_PER_LANG) {
        const refPath = join(FIXTURES_DIR, `fleurs-${lang}-${id}.txt`)
        if (existsSync(refPath)) {
          samples.push({
            lang: lang!,
            id: id!,
            audioPath: join(FIXTURES_DIR, file),
            refPath
          })
          countByLang.set(lang!, count + 1)
        }
      }
    }
  }
  return samples
}

/**
 * Check if Ollama has a model
 */
async function hasModel(model: string): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return false
    const data = (await response.json()) as { models: { name: string }[] }
    const modelBase = model.split(":")[0]
    return data.models.some((m) => m.name.startsWith(modelBase))
  } catch {
    return false
  }
}

async function main() {
  console.log("🔍 LLM Correction Benchmark (Real STT Outputs)\n")
  console.log(`Languages: ${LANGUAGES.join(", ").toUpperCase()}`)
  console.log(`Samples per language: ${SAMPLES_PER_LANG}`)
  console.log(`Models: ${MODELS.join(", ")}\n`)

  // Check Ollama
  try {
    await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) })
  } catch {
    console.error("❌ Ollama not running. Start with: ollama serve")
    process.exit(1)
  }

  // Check models
  for (const model of MODELS) {
    if (!(await hasModel(model))) {
      console.error(`❌ Model ${model} not found. Pull with: ollama pull ${model}`)
      process.exit(1)
    }
  }

  // Create directories
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true })
  if (!existsSync(STT_CACHE_DIR)) mkdirSync(STT_CACHE_DIR, { recursive: true })

  // Find samples
  const samples = findSamples()
  console.log(`Found ${samples.length} samples\n`)

  if (samples.length === 0) {
    console.error("❌ No FLEURS samples found in", FIXTURES_DIR)
    process.exit(1)
  }

  // Step 1: Transcribe all samples first (with caching)
  console.log("📝 STEP 1: Transcribing samples with Parakeet...\n")
  const sttOutputs = new Map<string, { reference: string; stt: string }>()

  for (const sample of samples) {
    const key = `${sample.lang}-${sample.id}`
    const reference = readFileSync(sample.refPath, "utf-8").trim()
    const stt = transcribeAudio(sample.audioPath, key)

    if (stt) {
      sttOutputs.set(key, { reference, stt })
      const wer = calculateWER(reference, stt)
      console.log(`  ${key}: WER = ${(wer * 100).toFixed(1)}%`)
    }
  }

  console.log(`\n✓ Transcribed ${sttOutputs.size} samples\n`)

  // Step 2: Test each LLM model
  console.log("🤖 STEP 2: Testing LLM correction...\n")
  const allResults: Result[] = []

  for (const model of MODELS) {
    console.log(`\n📊 Testing ${model}...`)

    for (const [key, { reference, stt }] of sttOutputs) {
      const [lang, id] = key.split("-")
      const werBefore = calculateWER(reference, stt)

      try {
        process.stdout.write(`  ${key}: `)
        const { corrected, tokensPerSec, timeMs } = await correctWithOllama(stt, model)
        const werAfter = calculateWER(reference, corrected)
        const improvement = werBefore > 0 ? ((werBefore - werAfter) / werBefore) * 100 : 0

        allResults.push({
          model,
          language: lang!,
          sampleId: id!,
          reference,
          sttOutput: stt,
          corrected,
          werBefore,
          werAfter,
          improvement,
          tokensPerSec,
          timeMs
        })

        const arrow = improvement > 0 ? "↓" : improvement < 0 ? "↑" : "="
        console.log(
          `${(werBefore * 100).toFixed(0)}% → ${(werAfter * 100).toFixed(0)}% (${improvement > 0 ? "+" : ""}${improvement.toFixed(0)}% ${arrow})`
        )
      } catch (e) {
        console.log(`❌ Error: ${e}`)
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(80))
  console.log("📊 BENCHMARK RESULTS")
  console.log("=".repeat(80))

  // Overall table
  console.log("\n### Overall Performance\n")
  console.log("| Model           | Avg WER Before | Avg WER After | Improvement | Speed (tok/s) |")
  console.log("|-----------------|----------------|---------------|-------------|---------------|")

  const modelStats: { model: string; improvement: number; speed: number }[] = []

  for (const model of MODELS) {
    const results = allResults.filter((r) => r.model === model)
    if (results.length === 0) continue

    const avgBefore = results.reduce((s, r) => s + r.werBefore, 0) / results.length
    const avgAfter = results.reduce((s, r) => s + r.werAfter, 0) / results.length
    const avgImprove = results.reduce((s, r) => s + r.improvement, 0) / results.length
    const avgSpeed = results.reduce((s, r) => s + r.tokensPerSec, 0) / results.length

    modelStats.push({ model, improvement: avgImprove, speed: avgSpeed })

    console.log(
      `| ${model.padEnd(15)} | ${(avgBefore * 100).toFixed(1).padStart(12)}% | ` +
        `${(avgAfter * 100).toFixed(1).padStart(11)}% | ` +
        `${avgImprove > 0 ? "+" : ""}${avgImprove.toFixed(1).padStart(9)}% | ` +
        `${avgSpeed.toFixed(0).padStart(13)} |`
    )
  }

  // Per language table
  console.log("\n### Per-Language WER Improvement\n")
  console.log("| Model           |   EN   |   DE   |   FR   |   ES   |   PT   |")
  console.log("|-----------------|--------|--------|--------|--------|--------|")

  for (const model of MODELS) {
    const byLang = LANGUAGES.map((lang) => {
      const results = allResults.filter((r) => r.model === model && r.language === lang)
      if (results.length === 0) return "  -   "
      const avg = results.reduce((s, r) => s + r.improvement, 0) / results.length
      return `${avg > 0 ? "+" : ""}${avg.toFixed(0)}%`.padStart(5)
    })
    console.log(`| ${model.padEnd(15)} | ${byLang.join("  | ")}  |`)
  }

  // Recommendation
  console.log("\n### Recommendation\n")

  const bestQuality = [...modelStats].sort((a, b) => b.improvement - a.improvement)[0]
  const bestSpeed = [...modelStats].sort((a, b) => b.speed - a.speed)[0]

  if (bestQuality) {
    console.log(
      `🏆 **Best Quality**: ${bestQuality.model} (${bestQuality.improvement > 0 ? "+" : ""}${bestQuality.improvement.toFixed(1)}% WER improvement)`
    )
  }
  if (bestSpeed) {
    console.log(`⚡ **Best Speed**: ${bestSpeed.model} (${bestSpeed.speed.toFixed(0)} tokens/sec)`)
  }

  if (bestQuality?.model === bestSpeed?.model) {
    console.log(`\n✅ **Recommended Default**: ${bestQuality.model}`)
  } else if (bestQuality && bestSpeed) {
    console.log(`\n💡 Consider ${bestQuality.model} for quality, ${bestSpeed.model} for speed`)
  }

  // Save detailed results
  const jsonPath = join(RESULTS_DIR, "benchmark-real.json")
  writeFileSync(jsonPath, JSON.stringify(allResults, null, 2))
  console.log(`\n📁 Detailed results saved to ${jsonPath}`)
}

main().catch(console.error)
