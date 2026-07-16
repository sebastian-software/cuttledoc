/**
 * Benchmark CLI module for comparing speech recognition models
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"

import { COREML_MODELS, type CoreMLModelType } from "../backends/coreml/index.js"
import { isModelDownloaded, BACKEND_TYPES } from "../index.js"
import { calculateAverageWER, calculateWER, type WERResult } from "../utils/wer.js"

/**
 * Benchmark result for a single audio file
 */
interface BenchmarkSample {
  audioFile: string
  referenceFile: string
  referenceText: string
  transcribedText: string
  durationSeconds: number
  processingTimeSeconds: number
  rtf: number // Real-Time Factor
  wer: WERResult
}

/**
 * Benchmark result for a model
 */
interface ModelBenchmark {
  model: CoreMLModelType
  samples: BenchmarkSample[]
  averageWER: WERResult
  averageRTF: number
  totalAudioSeconds: number
  totalProcessingSeconds: number
}

/**
 * Full benchmark report
 */
interface BenchmarkReport {
  timestamp: string
  models: ModelBenchmark[]
  fixtures: string[]
}

/**
 * Print benchmark help
 */
export function printBenchmarkHelp(): void {
  console.log(`
cuttledoc benchmark - Compare speech recognition models

USAGE:
  cuttledoc benchmark [options]
  cuttledoc benchmark run [models...]
  cuttledoc benchmark report

SUBCOMMANDS:
  run [models...]    Run benchmark on specified models (default: all downloaded)
  report             Show last benchmark results

OPTIONS:
  --fixtures <dir>   Directory with audio files and .md references (default: ./fixtures)
  --output <file>    Output JSON file for results (default: ./fixtures/benchmark.json)
  --language <code>  Filter fixtures by language (e.g., "de", "en")

EXAMPLES:
  cuttledoc benchmark run                    # Benchmark all downloaded models
  cuttledoc benchmark run whisper            # Benchmark Whisper only
  cuttledoc benchmark report                 # Show previous results
`)
}

/**
 * Find audio files with corresponding reference transcripts
 */
function findFixtures(fixturesDir: string, language?: string): { audio: string; reference: string }[] {
  const fixtures: { audio: string; reference: string }[] = []

  // Look for audio files with matching .md files
  const audioExtensions = [".ogg", ".mp3", ".wav", ".m4a", ".mp4", ".webm"]

  // Read directory
  const files = readdirSync(fixturesDir)

  for (const file of files) {
    const ext = file.substring(file.lastIndexOf("."))
    if (!audioExtensions.includes(ext)) {
      continue
    }

    // Find base name without model suffix
    // e.g., "fairytale-de.ogg" -> "fairytale-de"
    // but skip "fairytale-de.whisper-small.md" style files
    const baseName = file.replace(ext, "")

    // Skip files that look like transcription outputs
    if (baseName.includes(".whisper-") || baseName.includes(".parakeet-")) {
      continue
    }

    // Filter by language if specified
    // Supports: "fleurs-en-000", "fairytale-de", "audio-fr-001"
    if (language !== undefined) {
      const langMatch = /-([a-z]{2})(?:-\d+)?$/.exec(baseName)
      if (langMatch?.[1] !== language) {
        continue
      }
    }

    // Try .md first, then .txt
    let refPath = join(fixturesDir, `${baseName}.md`)
    if (!existsSync(refPath)) {
      refPath = join(fixturesDir, `${baseName}.txt`)
    }
    if (existsSync(refPath)) {
      fixtures.push({
        audio: join(fixturesDir, file),
        reference: refPath
      })
    }
  }

  return fixtures
}

/**
 * Validate the duration reported by the backend's decoded sample count.
 */
export function validateAudioDuration(audioPath: string, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Failed to determine audio duration for ${audioPath}: received ${String(durationSeconds)}`)
  }

  return durationSeconds
}

interface BenchmarkOptions {
  subcommand: string
  fixturesDir: string
  outputFile: string
  language: string | undefined
  specifiedModels: string[]
}

/**
 * Parse benchmark arguments and derive defaults after all options are known.
 */
export function parseBenchmarkOptions(args: string[], cwd = process.cwd()): BenchmarkOptions {
  const subcommand = args[0] ?? "run"
  let fixturesDir = join(cwd, "fixtures")
  let outputFile: string | undefined
  let language: string | undefined
  const specifiedModels: string[] = []

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) {
      continue
    }

    if (arg === "--fixtures" && args[i + 1] !== undefined) {
      fixturesDir = args[++i] ?? fixturesDir
    } else if (arg === "--output" && args[i + 1] !== undefined) {
      outputFile = args[++i]
    } else if (arg === "--language" && args[i + 1] !== undefined) {
      language = args[++i]
    } else if (!arg.startsWith("-")) {
      specifiedModels.push(arg)
    }
  }

  return {
    subcommand,
    fixturesDir,
    outputFile: outputFile ?? join(fixturesDir, "benchmark.json"),
    language,
    specifiedModels
  }
}

/**
 * Run benchmark for a single model
 */
export async function benchmarkModel(
  model: CoreMLModelType,
  fixtures: { audio: string; reference: string }[],
  onProgress?: (current: number, total: number, file: string) => void
): Promise<ModelBenchmark> {
  const { CoreMLBackend } = await import("../backends/coreml/index.js")
  const backend = new CoreMLBackend({ model })
  await backend.initialize()

  const samples: BenchmarkSample[] = []
  let totalAudioSeconds = 0
  let totalProcessingSeconds = 0

  try {
    for (let i = 0; i < fixtures.length; i++) {
      const fixture = fixtures[i]
      if (fixture === undefined) {
        continue
      }

      const { audio, reference } = fixture

      onProgress?.(i + 1, fixtures.length, basename(audio))

      // Read reference text
      const referenceText = readFileSync(reference, "utf-8")

      // Transcribe and measure time. The backend derives duration from the
      // decoded sample count, so no separate shell or system ffprobe is needed.
      const startTime = process.hrtime.bigint()
      const result = await backend.transcribe(audio)
      const endTime = process.hrtime.bigint()

      const durationSeconds = validateAudioDuration(audio, result.durationSeconds)
      const processingTimeSeconds = Number(endTime - startTime) / 1_000_000_000
      totalAudioSeconds += durationSeconds
      totalProcessingSeconds += processingTimeSeconds

      // Calculate WER
      const wer = calculateWER(referenceText, result.text)

      samples.push({
        audioFile: audio,
        referenceFile: reference,
        referenceText,
        transcribedText: result.text,
        durationSeconds,
        processingTimeSeconds,
        rtf: processingTimeSeconds / durationSeconds,
        wer
      })
    }
  } finally {
    await backend.dispose()
  }

  // Calculate averages
  const werResults = samples.map((s) => s.wer)
  const averageWER = calculateAverageWER(werResults)
  const averageRTF = totalProcessingSeconds / totalAudioSeconds

  return {
    model,
    samples,
    averageWER,
    averageRTF,
    totalAudioSeconds,
    totalProcessingSeconds
  }
}

/**
 * Print benchmark results as a table
 */
function printBenchmarkResults(report: BenchmarkReport): void {
  console.log("\n📊 Benchmark Results")
  console.log("═".repeat(80))

  // Sort by accuracy (best first)
  const sorted = [...report.models].sort((a, b) => b.averageWER.accuracy - a.averageWER.accuracy)

  // Header
  console.log(
    "Model".padEnd(25) + "WER".padStart(8) + "Accuracy".padStart(10) + "RTF".padStart(8) + "Speed".padStart(12)
  )
  console.log("-".repeat(80))

  for (const model of sorted) {
    const werPercent = `${(model.averageWER.wer * 100).toFixed(1)}%`
    const accuracy = `${(model.averageWER.accuracy * 100).toFixed(1)}%`
    const rtf = `${model.averageRTF.toFixed(2)}x`
    const speed =
      model.averageRTF < 1 ? `${(1 / model.averageRTF).toFixed(1)}x faster` : `${model.averageRTF.toFixed(1)}x slower`

    console.log(
      model.model.padEnd(25) + werPercent.padStart(8) + accuracy.padStart(10) + rtf.padStart(8) + speed.padStart(12)
    )
  }

  console.log("-".repeat(80))
  console.log(`\nTested ${String(report.fixtures.length)} audio files`)
  console.log(`Generated: ${report.timestamp}`)
}

/**
 * Run the benchmark command
 */
export async function runBenchmark(args: string[]): Promise<void> {
  const { subcommand, fixturesDir, outputFile, language, specifiedModels } = parseBenchmarkOptions(args)

  if (subcommand === "help" || args.includes("-h") || args.includes("--help")) {
    printBenchmarkHelp()
    return
  }

  if (subcommand === "report") {
    // Show existing results
    if (!existsSync(outputFile)) {
      console.error(`No benchmark results found at ${outputFile}`)
      console.error("Run 'cuttledoc benchmark run' first.")
      process.exit(1)
    }

    const report = JSON.parse(readFileSync(outputFile, "utf-8")) as BenchmarkReport
    printBenchmarkResults(report)
    return
  }

  if (subcommand === "run") {
    // Find fixtures
    if (!existsSync(fixturesDir)) {
      console.error(`Fixtures directory not found: ${fixturesDir}`)
      process.exit(1)
    }

    const fixtures = findFixtures(fixturesDir, language)
    if (fixtures.length === 0) {
      console.error(`No audio files with matching .md references found in ${fixturesDir}`)
      process.exit(1)
    }

    console.log(`\n🎯 Found ${String(fixtures.length)} test fixtures`)
    for (const f of fixtures) {
      console.log(`   ${basename(f.audio)}`)
    }

    // Determine which models to benchmark
    let modelsToTest: CoreMLModelType[]

    if (specifiedModels.length > 0) {
      // Validate specified models
      modelsToTest = []
      for (const m of specifiedModels) {
        if (!(m in COREML_MODELS)) {
          console.warn(`Unknown model: ${m}`)
          continue
        }
        const backendType = m === "parakeet" ? BACKEND_TYPES.parakeet : BACKEND_TYPES.whisper
        const downloaded = await isModelDownloaded(backendType)
        if (!downloaded) {
          console.warn(`Model not downloaded: ${m}. Run 'cuttledoc models download ${m}' first.`)
          continue
        }
        modelsToTest.push(m as CoreMLModelType)
      }
    } else {
      // Use all downloaded models
      modelsToTest = []
      for (const m of Object.keys(COREML_MODELS) as CoreMLModelType[]) {
        const backendType = m === "parakeet" ? BACKEND_TYPES.parakeet : BACKEND_TYPES.whisper
        const downloaded = await isModelDownloaded(backendType)
        if (downloaded) {
          modelsToTest.push(m)
        }
      }
    }

    if (modelsToTest.length === 0) {
      console.error("No models available to benchmark.")
      console.error("Download models first: cuttledoc models download <model>")
      process.exit(1)
    }

    console.log(`\n🔬 Benchmarking ${String(modelsToTest.length)} models:`)
    for (const m of modelsToTest) {
      console.log(`   ${m}`)
    }

    // Run benchmarks
    const modelResults: ModelBenchmark[] = []

    for (const model of modelsToTest) {
      console.log(`\n⏱️  Testing ${model}...`)

      const result = await benchmarkModel(model, fixtures, (current, total, file) => {
        process.stdout.write(`\r   [${String(current)}/${String(total)}] ${file}`.padEnd(60))
      })

      console.log(
        `\r   ✓ WER: ${(result.averageWER.wer * 100).toFixed(1)}%, RTF: ${result.averageRTF.toFixed(2)}x`.padEnd(60)
      )

      modelResults.push(result)
    }

    // Create report
    const report: BenchmarkReport = {
      timestamp: new Date().toISOString(),
      models: modelResults,
      fixtures: fixtures.map((f) => f.audio)
    }

    // Save results
    writeFileSync(outputFile, JSON.stringify(report, null, 2))
    console.log(`\n💾 Results saved to ${outputFile}`)

    // Print summary
    printBenchmarkResults(report)
  } else {
    console.error(`Unknown benchmark subcommand: ${subcommand}`)
    printBenchmarkHelp()
    process.exit(1)
  }
}
