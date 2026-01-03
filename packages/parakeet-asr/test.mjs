/**
 * Quick test for Parakeet ASR
 */

import { ParakeetAsrEngine, isAvailable } from "./dist/index.js"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

console.log("Parakeet ASR Test")
console.log("=================")
console.log("Platform:", process.platform)
console.log("Available:", isAvailable())

if (!isAvailable()) {
  console.log("Parakeet ASR is only available on macOS")
  process.exit(1)
}

const modelDir = join(process.cwd(), "../../models/parakeet-coreml")
console.log("Model directory:", modelDir)

try {
  const engine = new ParakeetAsrEngine({ modelDir })
  console.log("\nInitializing engine...")
  await engine.initialize()
  console.log("Engine ready:", engine.isReady())
  console.log("Version:", engine.getVersion())

  // Load a test audio file - use the English test file from the model
  const audioFile = "../../models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/test_wavs/en.wav"
  console.log("\nTest audio:", audioFile)

  // Convert to WAV using ffmpeg - ensure 16kHz mono
  const wavFile = "/tmp/test-audio-en.wav"
  execSync(`ffmpeg -y -i "${audioFile}" -ar 16000 -ac 1 -f wav "${wavFile}"`, {
    stdio: "pipe",
    cwd: join(process.cwd())
  })

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
  console.log("Sample range:", Math.min(...normalized.slice(0, 1000)), "to", Math.max(...normalized.slice(0, 1000)))
  console.log("\nTranscribing...")

  const result = await engine.transcribe(normalized, 16000)
  console.log("\nResult:")
  console.log("  Text:", result.text)
  console.log("  Duration:", result.durationMs.toFixed(2), "ms")

  engine.cleanup()
  console.log("\nTest complete!")
} catch (error) {
  console.error("Error:", error.message)
  console.error(error.stack)
  process.exit(1)
}
