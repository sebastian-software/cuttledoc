#!/usr/bin/env npx tsx
/**
 * Simple LLM Correction Benchmark
 *
 * Tests different Ollama models on transcript correction quality.
 * Uses reference texts with simulated STT errors.
 *
 * Usage:
 *   npx tsx scripts/benchmark-simple.ts
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(__dirname, "..", "..", "cuttledoc", "fixtures")
const RESULTS_DIR = join(__dirname, "..", "results")

// Models to benchmark
const MODELS = ["gemma3n:latest", "qwen2.5:7b", "mistral:7b"]
const LANGUAGES = ["en", "de", "fr", "es", "pt"]
const SAMPLES_PER_LANG = 2

interface Result {
  model: string
  language: string
  werBefore: number
  werAfter: number
  improvement: number
  tokensPerSec: number
  timeMs: number
}

/**
 * Simulate typical STT errors
 */
function addSTTErrors(text: string): string {
  let result = text
    // Remove punctuation (common STT issue)
    .replace(/[.,!?;:]/g, "")
    // Lowercase everything
    .toLowerCase()
    // Merge some words (word boundary errors)
    .replace(/\b(the|a|an) (\w+)/gi, (_, art, word) => `${art}${word}`)
    // Split some compound words
    .replace(/\b(\w{4,})(\w{4,})\b/g, "$1 $2")
    // Homophone errors
    .replace(/\btheir\b/g, "there")
    .replace(/\byou're\b/g, "your")
    .replace(/\bit's\b/g, "its")
  return result
}

/**
 * Calculate WER
 */
function calculateWER(reference: string, hypothesis: string): number {
  const ref = reference.toLowerCase().split(/\s+/).filter(Boolean)
  const hyp = hypothesis.toLowerCase().split(/\s+/).filter(Boolean)
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
 * Correct with Ollama
 */
async function correctWithOllama(
  text: string,
  model: string
): Promise<{ corrected: string; tokensPerSec: number; timeMs: number }> {
  const prompt = `Fix this speech-to-text transcript. Fix grammar, punctuation, and capitalization.
Output ONLY the corrected text, nothing else.

Transcript: ${text}`

  const start = performance.now()
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.3 } }),
    signal: AbortSignal.timeout(60000)
  })

  if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`)

  const data = (await response.json()) as { response: string; eval_count?: number; eval_duration?: number }
  const timeMs = performance.now() - start
  const tokensPerSec = data.eval_count && data.eval_duration ? data.eval_count / (data.eval_duration / 1e9) : 0

  return { corrected: data.response.trim(), tokensPerSec, timeMs }
}

/**
 * Find FLEURS samples
 */
function findSamples(): { lang: string; id: string; text: string }[] {
  const samples: { lang: string; id: string; text: string }[] = []
  const files = readdirSync(FIXTURES_DIR)
  const countByLang = new Map<string, number>()

  for (const file of files.sort()) {
    const match = file.match(/^fleurs-(\w+)-(\d+)\.txt$/)
    if (match) {
      const [, lang, id] = match
      const count = countByLang.get(lang!) ?? 0
      if (count < SAMPLES_PER_LANG) {
        const text = readFileSync(join(FIXTURES_DIR, file), "utf-8").trim()
        if (text.length > 20) {
          samples.push({ lang: lang!, id: id!, text })
          countByLang.set(lang!, count + 1)
        }
      }
    }
  }
  return samples
}

async function main() {
  console.log("🔍 LLM Correction Benchmark\n")

  // Check Ollama
  try {
    await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) })
  } catch {
    console.error("❌ Ollama not running. Start with: ollama serve")
    process.exit(1)
  }

  const samples = findSamples()
  console.log(`Found ${samples.length} samples\n`)

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true })

  const allResults: Result[] = []

  for (const model of MODELS) {
    console.log(`\n📊 Testing ${model}...`)

    for (const sample of samples) {
      const errorText = addSTTErrors(sample.text)
      const werBefore = calculateWER(sample.text, errorText)

      try {
        const { corrected, tokensPerSec, timeMs } = await correctWithOllama(errorText, model)
        const werAfter = calculateWER(sample.text, corrected)
        const improvement = werBefore > 0 ? ((werBefore - werAfter) / werBefore) * 100 : 0

        allResults.push({
          model,
          language: sample.lang,
          werBefore,
          werAfter,
          improvement,
          tokensPerSec,
          timeMs
        })

        console.log(
          `  ${sample.lang}-${sample.id}: WER ${(werBefore * 100).toFixed(0)}% → ${(werAfter * 100).toFixed(0)}% (${improvement > 0 ? "+" : ""}${improvement.toFixed(0)}%)`
        )
      } catch (e) {
        console.error(`  ❌ ${sample.lang}-${sample.id}: ${e}`)
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(70))
  console.log("📊 SUMMARY\n")
  console.log("| Model           | Avg WER Before | Avg WER After | Improvement | Speed |")
  console.log("|-----------------|----------------|---------------|-------------|-------|")

  for (const model of MODELS) {
    const results = allResults.filter((r) => r.model === model)
    if (results.length === 0) continue

    const avgBefore = results.reduce((s, r) => s + r.werBefore, 0) / results.length
    const avgAfter = results.reduce((s, r) => s + r.werAfter, 0) / results.length
    const avgImprove = results.reduce((s, r) => s + r.improvement, 0) / results.length
    const avgSpeed = results.reduce((s, r) => s + r.tokensPerSec, 0) / results.length

    console.log(
      `| ${model.padEnd(15)} | ${(avgBefore * 100).toFixed(1).padStart(12)}% | ` +
        `${(avgAfter * 100).toFixed(1).padStart(11)}% | ` +
        `${avgImprove > 0 ? "+" : ""}${avgImprove.toFixed(0).padStart(9)}% | ` +
        `${avgSpeed.toFixed(0).padStart(5)} |`
    )
  }

  // Per language
  console.log("\n### Per Language Improvement\n")
  console.log("| Model           | EN | DE | FR | ES | PT |")
  console.log("|-----------------|----|----|----|----|------|")

  for (const model of MODELS) {
    const byLang = LANGUAGES.map((lang) => {
      const results = allResults.filter((r) => r.model === model && r.language === lang)
      return results.length > 0 ? results.reduce((s, r) => s + r.improvement, 0) / results.length : 0
    })
    console.log(
      `| ${model.padEnd(15)} | ` +
        byLang.map((v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`.padStart(3)).join(" | ") +
        " |"
    )
  }

  // Recommendation
  const avgByModel = MODELS.map((model) => ({
    model,
    improvement:
      allResults.filter((r) => r.model === model).reduce((s, r) => s + r.improvement, 0) /
      (allResults.filter((r) => r.model === model).length || 1),
    speed:
      allResults.filter((r) => r.model === model).reduce((s, r) => s + r.tokensPerSec, 0) /
      (allResults.filter((r) => r.model === model).length || 1)
  }))

  const bestQuality = avgByModel.sort((a, b) => b.improvement - a.improvement)[0]
  const bestSpeed = avgByModel.sort((a, b) => b.speed - a.speed)[0]

  console.log("\n### Recommendation\n")
  console.log(`🏆 Best Quality: ${bestQuality?.model} (+${bestQuality?.improvement.toFixed(0)}% improvement)`)
  console.log(`⚡ Best Speed: ${bestSpeed?.model} (${bestSpeed?.speed.toFixed(0)} tok/s)`)

  // Save results
  writeFileSync(join(RESULTS_DIR, "benchmark.json"), JSON.stringify(allResults, null, 2))
  console.log(`\n📁 Results saved to ${RESULTS_DIR}/benchmark.json`)
}

main().catch(console.error)
