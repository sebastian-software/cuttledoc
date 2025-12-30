/**
 * Python ASR Backend Client
 *
 * Unified client for Python-based ASR backends:
 * - phi4: Microsoft Phi-4-multimodal (best quality for EN/DE/ES)
 * - canary: NVIDIA Canary-1B-v2 (25 EU languages)
 *
 * The client spawns a Python HTTP server that hosts the models,
 * providing stable communication and model caching.
 */

import { spawn, type ChildProcess } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  type Backend,
  type TranscribeOptions,
  type TranscriptionResult,
  type TranscriptionSegment
} from "../../types.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DEFAULT_PORT = 8765
const PACKAGE_ROOT = join(__dirname, "..")
const SERVER_SCRIPT = join(PACKAGE_ROOT, "src", "backends", "python-asr", "server.py")

const HEALTH_CHECK_INTERVAL = 500 // ms
const HEALTH_CHECK_TIMEOUT = 180_000 // 3 minutes for model loading
const REQUEST_TIMEOUT = 300_000 // 5 minutes for long audio

/**
 * Supported Python ASR backends
 */
export type PythonASRBackendType = "phi4" | "canary"

/**
 * Languages supported by Phi-4-multimodal
 */
export const PHI4_LANGUAGES = ["en", "de", "fr", "es", "it", "pt", "zh", "ja"] as const

/**
 * Languages supported by Canary-1B-v2
 */
export const CANARY_LANGUAGES = [
  "en",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "nl",
  "pl",
  "cs",
  "sk",
  "hu",
  "ro",
  "bg",
  "el",
  "sv",
  "da",
  "fi",
  "no",
  "hr",
  "sl",
  "et",
  "lv",
  "lt",
  "mt",
  "uk",
  "ru"
] as const

export type Phi4Language = (typeof PHI4_LANGUAGES)[number]
export type CanaryLanguage = (typeof CANARY_LANGUAGES)[number]

/**
 * Check if a language is supported by Phi-4
 */
export function isPhi4Language(lang: string): lang is Phi4Language {
  return PHI4_LANGUAGES.includes(lang.toLowerCase().split("-")[0] as Phi4Language)
}

/**
 * Check if a language is supported by Canary
 */
export function isCanaryLanguage(lang: string): lang is CanaryLanguage {
  return CANARY_LANGUAGES.includes(lang.toLowerCase().split("-")[0] as CanaryLanguage)
}

// Singleton server process
let serverProcess: ChildProcess | null = null
let serverPort: number = DEFAULT_PORT
let serverReady = false
let currentBackend: PythonASRBackendType = "phi4"

/**
 * Wait for the server to be ready
 */
async function waitForServer(port: number, timeoutMs: number = HEALTH_CHECK_TIMEOUT): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/health`, {
        signal: AbortSignal.timeout(1000)
      })
      if (response.ok) {
        serverReady = true
        return
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL))
  }

  throw new Error(`Python ASR server did not start within ${String(timeoutMs / 1000)}s`)
}

/**
 * Find Python executable
 */
async function findPython(): Promise<string> {
  const venvPython = join(PACKAGE_ROOT, "..", "..", "experiments", "phi4-prototype", "venv", "bin", "python")

  const pythonPaths = [venvPython, "python3", "python"]

  for (const p of pythonPaths) {
    try {
      const proc = spawn(p, ["--version"], { stdio: "pipe" })
      await new Promise<void>((resolve, reject) => {
        proc.on("close", (code) => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(`Python check failed with code ${String(code)}`))
          }
        })
        proc.on("error", (err) => {
          reject(err)
        })
      })
      return p
    } catch {
      continue
    }
  }

  throw new Error("Python not found. Please install Python 3.8+")
}

/**
 * Start the Python ASR server
 */
async function startServer(port: number = DEFAULT_PORT, backend: PythonASRBackendType = "phi4"): Promise<void> {
  if (serverProcess !== null && serverReady && currentBackend === backend) {
    return // Already running with correct backend
  }

  // Kill any existing process
  if (serverProcess !== null) {
    serverProcess.kill()
    serverProcess = null
    serverReady = false
  }

  serverPort = port
  currentBackend = backend

  const pythonPath = await findPython()

  console.log(`Starting Python ASR server (${backend}) on port ${String(port)}...`)

  serverProcess = spawn(pythonPath, [SERVER_SCRIPT, "--port", String(port), "--backend", backend, "--preload"], {
    stdio: ["ignore", "inherit", "inherit"],
    detached: false
  })

  serverProcess.on("error", (err) => {
    console.error("Python ASR server error:", err)
    serverProcess = null
    serverReady = false
  })

  serverProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Python ASR server exited with code ${String(code)}`)
    }
    serverProcess = null
    serverReady = false
  })

  await waitForServer(port)

  console.log(`Python ASR server ready (${backend})`)
}

/**
 * Stop the Python ASR server
 */
export function stopServer(): void {
  if (serverProcess !== null) {
    serverProcess.kill()
    serverProcess = null
    serverReady = false
  }
}

interface PythonASRResponse {
  text: string
  duration_seconds: number
  processing_seconds: number
  language: string
  device: string
  backend: string
  error?: string
}

/**
 * Call the transcription endpoint
 */
async function callTranscribe(
  audioPath: string,
  language?: string,
  backend?: PythonASRBackendType
): Promise<PythonASRResponse> {
  const response = await fetch(`http://127.0.0.1:${String(serverPort)}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_path: audioPath,
      language,
      backend: backend ?? currentBackend
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  })

  const result = (await response.json()) as PythonASRResponse

  if (!response.ok || result.error !== undefined) {
    throw new Error(result.error ?? `Server error: ${String(response.status)}`)
  }

  return result
}

/**
 * Python ASR Backend base class
 */
abstract class PythonASRBackend implements Backend {
  protected port: number
  protected isInitialized = false
  abstract readonly backendType: PythonASRBackendType
  abstract readonly backendName: "phi4" | "canary"

  constructor(options: { port?: number } = {}) {
    this.port = options.port ?? DEFAULT_PORT
  }

  isAvailable(): boolean {
    return true // Actual check happens on initialization
  }

  async initialize(): Promise<void> {
    if (this.isInitialized && currentBackend === this.backendType) return

    await startServer(this.port, this.backendType)
    this.isInitialized = true
  }

  async transcribe(audioPath: string, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
    await this.initialize()

    const result = await callTranscribe(audioPath, options.language, this.backendType)

    const segments: TranscriptionSegment[] = [
      {
        text: result.text,
        startSeconds: 0,
        endSeconds: result.duration_seconds
      }
    ]

    return {
      text: result.text,
      segments,
      durationSeconds: result.duration_seconds,
      processingTimeSeconds: result.processing_seconds,
      language: result.language,
      backend: this.backendName
    }
  }

  async dispose(): Promise<void> {
    await Promise.resolve()
    this.isInitialized = false
  }
}

/**
 * Phi-4-multimodal Backend
 *
 * Best for: German, English, Spanish, Italian (3-5% WER)
 * Supported: EN, DE, FR, ES, IT, PT, ZH, JA (8 languages)
 */
export class Phi4Backend extends PythonASRBackend {
  readonly backendType: PythonASRBackendType = "phi4"
  readonly backendName = "phi4" as const
}

/**
 * Canary-1B-v2 Backend
 *
 * Best for: European languages (25 languages, 4-12% WER)
 * Includes: All EU languages + Russian + Ukrainian
 */
export class CanaryBackend extends PythonASRBackend {
  readonly backendType: PythonASRBackendType = "canary"
  readonly backendName = "canary" as const
}

/**
 * Export server control for cleanup
 */
export { stopServer as exitPython }
