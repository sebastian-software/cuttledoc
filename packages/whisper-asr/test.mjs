/**
 * Quick test for Whisper ASR
 */

import { WhisperAsrEngine, isAvailable } from "./dist/index.js"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

console.log("Whisper ASR Test")
console.log("================")
console.log("Platform:", process.platform)
console.log("Architecture:", process.arch)
console.log("Available:", isAvailable())

if (!isAvailable()) {
  console.log("Whisper ASR is only available on macOS ARM64")
  process.exit(1)
}

const modelPath = join(process.cwd(), "vendor/whisper.cpp/models/ggml-large-v3-turbo.bin")
console.log("Model path:", modelPath)

try {
  const engine = new WhisperAsrEngine({
    modelPath,
    language: "auto"
  })

  console.log("\nInitializing engine...")
  await engine.initialize()
  console.log("Engine ready:", engine.isReady())
  console.log("Version:", engine.getVersion())

  // Load a test audio file - use the already converted 16kHz file
  const wavFile = "/tmp/en_16k.wav"
  console.log("\nTest audio:", wavFile)

  // Read WAV file and extract samples
  const wavBuffer = readFileSync(wavFile)

  // WAV header is 44 bytes, data is int16 PCM
  const dataStart = 44
  const dataLength = wavBuffer.length - dataStart
  const numSamples = dataLength / 2 // int16 = 2 bytes

  // Convert int16 to float32 normalized to [-1, 1]
  const int16View = new Int16Array(wavBuffer.buffer, dataStart, numSamples)
  const normalized = new Float32Array(numSamples)
  for (let i = 0; i < numSamples; i++) {
    normalized[i] = int16View[i] / 32768.0
  }

  console.log("Audio samples:", normalized.length)
  console.log("Duration:", (normalized.length / 16000).toFixed(2), "seconds")
  console.log("\nTranscribing...")

  const result = await engine.transcribe(normalized, 16000)

  console.log("\nResult:")
  console.log("  Text:", result.text)
  console.log("  Language:", result.language)
  console.log("  Duration:", result.durationMs.toFixed(2), "ms")
  console.log("  Segments:", result.segments.length)

  if (result.segments.length > 0) {
    console.log("\nSegments:")
    for (const seg of result.segments) {
      console.log(`  [${seg.startMs}ms - ${seg.endMs}ms] ${seg.text}`)
    }
  }

  engine.cleanup()
  console.log("\nTest complete!")
} catch (error) {
  console.error("Error:", error.message)
  console.error(error.stack)
  process.exit(1)
}
