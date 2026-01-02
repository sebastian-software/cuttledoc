#!/usr/bin/env npx tsx
/**
 * LLM Correction Benchmark with TTS Audio
 *
 * Uses ElevenLabs TTS audio to test LLM correction quality with longer texts.
 * Compares STT output against the original reference text.
 *
 * Usage:
 *   cd packages/llm && npx tsx scripts/benchmark-tts.ts
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { TRANSCRIPT_CORRECTION_PROMPT } from "../src/types.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = join(__dirname, "..", "..", "..")
const FIXTURES_DIR = join(__dirname, "..", "fixtures")
const AUDIO_DIR = join(FIXTURES_DIR, "audio")
const TEXTS_DIR = join(FIXTURES_DIR, "texts")
const RESULTS_DIR = join(__dirname, "..", "results")
const STT_CACHE_DIR = join(RESULTS_DIR, "tts-stt-cache")
const COMPARISON_DIR = join(RESULTS_DIR, "comparisons")

// LLM models to benchmark
const LLM_MODELS = ["gemma3n:latest", "phi4:14b"]

interface Sample {
  language: string
  speaker: string
  audioPath: string
  referenceText: string
}

interface Result {
  model: string
  language: string
  speaker: string
  referenceWordCount: number
  sttWordCount: number
  werBefore: number
  werAfter: number
  improvement: number
  tokensPerSec: number
  timeMs: number
}

/**
 * Calculate Word Error Rate using Levenshtein distance
 */
function calculateWER(reference: string, hypothesis: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s\u00C0-\u017F]/g, "") // Keep accented chars
      .split(/\s+/)
      .filter(Boolean)

  const ref = normalize(reference)
  const hyp = normalize(hypothesis)

  if (ref.length === 0) return hyp.length > 0 ? 1 : 0

  const m = ref.length
  const n = hyp.length
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
 * Find all TTS audio samples
 */
function findSamples(): Sample[] {
  const samples: Sample[] = []

  if (!existsSync(AUDIO_DIR)) {
    console.error(`Audio directory not found: ${AUDIO_DIR}`)
    return samples
  }

  const audioFiles = readdirSync(AUDIO_DIR).filter(
    (f) => f.endsWith(".mp3") || f.endsWith(".wav") || f.endsWith(".ogg")
  )

  for (const audioFile of audioFiles) {
    // Parse filename: "de-sample - Mila.ogg" -> lang=de, speaker=Mila
    const match = audioFile.match(/^(\w{2})-sample\s*-\s*(.+)\.(mp3|wav|ogg)$/i)
    if (!match) {
      console.warn(`  Skipping unrecognized file: ${audioFile}`)
      continue
    }

    const [, lang, speaker] = match
    const refTextPath = join(TEXTS_DIR, `${lang}-sample.txt`)

    if (!existsSync(refTextPath)) {
      console.warn(`  Reference text not found for ${audioFile}: ${refTextPath}`)
      continue
    }

    // Read and clean reference text (remove markdown headers)
    let referenceText = readFileSync(refTextPath, "utf-8")
    referenceText = referenceText
      .replace(/^#+ .+$/gm, "") // Remove headers
      .replace(/\n{3,}/g, "\n\n") // Normalize newlines
      .trim()

    samples.push({
      language: lang.toLowerCase(),
      speaker: speaker.trim(),
      audioPath: join(AUDIO_DIR, audioFile),
      referenceText
    })
  }

  return samples
}

/**
 * Transcribe audio file using cuttledoc CLI
 * Uses Whisper for all languages (more reliable multilingual support)
 */
function transcribeAudio(audioPath: string, cacheKey: string, language: string): string {
  mkdirSync(STT_CACHE_DIR, { recursive: true })
  const cachePath = join(STT_CACHE_DIR, `${cacheKey}.txt`)

  // Return cached result if exists
  if (existsSync(cachePath)) {
    console.log(`    📦 Using cached STT for ${cacheKey}`)
    return readFileSync(cachePath, "utf-8")
  }

  // Use Whisper for all languages (Parakeet int8 has issues with some languages like FR)
  const backend = "whisper"
  console.log(`    📝 Transcribing ${basename(audioPath)} (${backend}, lang=${language})...`)

  const cuttledocBin = join(WORKSPACE_ROOT, "packages", "cuttledoc", "bin", "cuttledoc.js")

  try {
    const result = execSync(`node "${cuttledocBin}" "${audioPath}" --backend ${backend} --language ${language}`, {
      encoding: "utf-8",
      timeout: 600000, // 10 minutes for Whisper (roughly realtime)
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
      // Fallback: take everything that looks like content
      transcript = result
        .split("\n")
        .filter((l) => !l.startsWith("⏱") && !l.startsWith("📊") && !l.includes("cuttledoc") && l.trim())
        .join("\n")
        .trim()
    }

    // Cache the result
    writeFileSync(cachePath, transcript)
    console.log(`    ✓ Transcribed: ${transcript.split(/\s+/).length} words`)
    return transcript
  } catch (error) {
    console.error(`    ❌ Transcription failed: ${error}`)
    return ""
  }
}

/**
 * Correct text with Ollama
 */
async function correctWithOllama(
  text: string,
  model: string
): Promise<{ corrected: string; tokensPerSec: number; timeMs: number }> {
  const prompt = `${TRANSCRIPT_CORRECTION_PROMPT}
${text}`

  const start = performance.now()

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.2 }
      }),
      signal: AbortSignal.timeout(300000) // 5 minutes for longer texts
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`)
    }

    const data = (await response.json()) as { response: string; eval_count?: number; eval_duration?: number }
    const timeMs = performance.now() - start
    const tokensPerSec = data.eval_count && data.eval_duration ? data.eval_count / (data.eval_duration / 1e9) : 0

    return { corrected: data.response.trim(), tokensPerSec, timeMs }
  } catch (error) {
    console.error(`    ❌ LLM error: ${error}`)
    return { corrected: text, tokensPerSec: 0, timeMs: 0 }
  }
}

/**
 * Main benchmark function
 */
async function main() {
  console.log("🔍 LLM Correction Benchmark (TTS Audio)\n")

  const samples = findSamples()
  if (samples.length === 0) {
    console.error("No samples found! Add audio files to fixtures/audio/")
    process.exit(1)
  }

  console.log(`Found ${samples.length} samples:`)
  for (const s of samples) {
    console.log(`  - ${s.language.toUpperCase()}: ${s.speaker} (${s.referenceText.split(/\s+/).length} words)`)
  }
  console.log()

  // Step 1: Transcribe all audio
  console.log("📝 STEP 1: Transcribing audio with Parakeet...\n")

  const sttResults: Map<string, { stt: string; wer: number }> = new Map()

  for (const sample of samples) {
    const cacheKey = `${sample.language}-${sample.speaker.replace(/\s+/g, "_")}`
    const stt = transcribeAudio(sample.audioPath, cacheKey, sample.language)

    if (stt) {
      const wer = calculateWER(sample.referenceText, stt)
      sttResults.set(cacheKey, { stt, wer })
      console.log(`    ${sample.language.toUpperCase()} ${sample.speaker}: WER = ${(wer * 100).toFixed(1)}%\n`)
    }
  }

  // Step 2: Test LLM correction
  console.log("\n🤖 STEP 2: Testing LLM correction...\n")

  const results: Result[] = []

  for (const model of LLM_MODELS) {
    console.log(`\n📊 Testing ${model}...`)

    for (const sample of samples) {
      const cacheKey = `${sample.language}-${sample.speaker.replace(/\s+/g, "_")}`
      const sttData = sttResults.get(cacheKey)

      if (!sttData) continue

      console.log(`  ${sample.language.toUpperCase()} ${sample.speaker}:`)

      const { corrected, tokensPerSec, timeMs } = await correctWithOllama(sttData.stt, model)
      const werAfter = calculateWER(sample.referenceText, corrected)
      const improvement = sttData.wer > 0 ? ((sttData.wer - werAfter) / sttData.wer) * 100 : 0

      const arrow = werAfter < sttData.wer ? "↓" : werAfter > sttData.wer ? "↑" : "="
      console.log(
        `    ${(sttData.wer * 100).toFixed(0)}% → ${(werAfter * 100).toFixed(0)}% (${improvement > 0 ? "+" : ""}${improvement.toFixed(0)}% ${arrow})`
      )

      results.push({
        model,
        language: sample.language,
        speaker: sample.speaker,
        referenceWordCount: sample.referenceText.split(/\s+/).length,
        sttWordCount: sttData.stt.split(/\s+/).length,
        werBefore: sttData.wer,
        werAfter,
        improvement,
        tokensPerSec,
        timeMs
      })

      // Save comparison file for this sample
      mkdirSync(COMPARISON_DIR, { recursive: true })
      const comparisonPath = join(
        COMPARISON_DIR,
        `${sample.language}-${sample.speaker.replace(/\s+/g, "_")}-${model.replace(/[:/]/g, "-")}.md`
      )
      const comparison = `# Vergleich: ${sample.language.toUpperCase()} - ${sample.speaker}
## Model: ${model}

---

## 1. ORIGINAL (Referenztext)
**WER Baseline: 0%**

${sample.referenceText}

---

## 2. STT OUTPUT (Parakeet)
**WER: ${(sttData.wer * 100).toFixed(1)}%**

${sttData.stt}

---

## 3. LLM KORRIGIERT (${model})
**WER: ${(werAfter * 100).toFixed(1)}%** (${improvement > 0 ? "+" : ""}${improvement.toFixed(0)}% Verbesserung)

${corrected}

---

## Statistik
- Original Wörter: ${sample.referenceText.split(/\s+/).length}
- STT Wörter: ${sttData.stt.split(/\s+/).length}
- LLM Wörter: ${corrected.split(/\s+/).length}
- Verarbeitungszeit: ${(timeMs / 1000).toFixed(1)}s
- Geschwindigkeit: ${tokensPerSec.toFixed(0)} tokens/s
`
      writeFileSync(comparisonPath, comparison)
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(80))
  console.log("📊 BENCHMARK RESULTS")
  console.log("=".repeat(80))

  // Group by model
  const byModel = new Map<string, Result[]>()
  for (const r of results) {
    if (!byModel.has(r.model)) byModel.set(r.model, [])
    byModel.get(r.model)!.push(r)
  }

  console.log("\n### Overall Performance\n")
  console.log("| Model | Samples | Avg WER Before | Avg WER After | Improvement | Speed |")
  console.log("|-------|---------|----------------|---------------|-------------|-------|")

  for (const [model, modelResults] of byModel) {
    const avgBefore = modelResults.reduce((sum, r) => sum + r.werBefore, 0) / modelResults.length
    const avgAfter = modelResults.reduce((sum, r) => sum + r.werAfter, 0) / modelResults.length
    const avgImprovement = modelResults.reduce((sum, r) => sum + r.improvement, 0) / modelResults.length
    const avgSpeed = modelResults.reduce((sum, r) => sum + r.tokensPerSec, 0) / modelResults.length

    console.log(
      `| ${model.padEnd(13)} | ${modelResults.length.toString().padStart(7)} | ${(avgBefore * 100).toFixed(1).padStart(13)}% | ${(avgAfter * 100).toFixed(1).padStart(12)}% | ${(avgImprovement > 0 ? "+" : "") + avgImprovement.toFixed(1).padStart(10)}% | ${avgSpeed.toFixed(0).padStart(5)} t/s |`
    )
  }

  // Per-language breakdown
  console.log("\n### Per-Language Results\n")
  console.log("| Language | Speaker | WER Before | WER After | Change |")
  console.log("|----------|---------|------------|-----------|--------|")

  // Only show best model results
  const bestModel = LLM_MODELS[0]
  const bestResults = byModel.get(bestModel) || []

  for (const r of bestResults) {
    const change = r.werAfter - r.werBefore
    const arrow = change < 0 ? "✓" : change > 0 ? "✗" : "="
    console.log(
      `| ${r.language.toUpperCase().padEnd(8)} | ${r.speaker.padEnd(15).slice(0, 15)} | ${(r.werBefore * 100).toFixed(1).padStart(9)}% | ${(r.werAfter * 100).toFixed(1).padStart(8)}% | ${(change * 100).toFixed(1).padStart(5)}% ${arrow} |`
    )
  }

  // Save results
  mkdirSync(RESULTS_DIR, { recursive: true })
  const resultsPath = join(RESULTS_DIR, "benchmark-tts.json")
  writeFileSync(resultsPath, JSON.stringify(results, null, 2))
  console.log(`\n📁 Results saved to ${resultsPath}`)
}

main().catch(console.error)
