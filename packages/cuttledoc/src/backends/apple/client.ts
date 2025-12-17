/**
 * Unix Socket client for the Cuttledoc Speech Server
 *
 * Communicates with the Swift-based speech recognition server
 * over a Unix domain socket.
 */

import { Socket, createConnection } from "node:net"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

/** Default socket path */
const DEFAULT_SOCKET_PATH = "/tmp/cuttledoc-speech.sock"

/** Path to the app bundle and binary */
const SERVER_APP_PATH = join(__dirname, "swift", "Cuttledoc.app")
const SERVER_BINARY_PATH = join(SERVER_APP_PATH, "Contents", "MacOS", "Cuttledoc")

/** Request types */
interface TranscribeRequest {
  action: "transcribe"
  audioPath: string
  language: string
}

interface PingRequest {
  action: "ping"
}

interface ShutdownRequest {
  action: "shutdown"
}

type ServerRequest = TranscribeRequest | PingRequest | ShutdownRequest

/** Response from server */
export interface ServerResponse {
  success: boolean
  text?: string
  segments?: Array<{
    text: string
    startSeconds: number
    endSeconds: number
    confidence: number
  }>
  durationSeconds?: number
  error?: string
  message?: string
}

/**
 * Client for the Cuttledoc Speech Server
 */
export class SpeechServerClient {
  private socketPath: string
  private serverProcess: ChildProcess | null = null

  constructor(socketPath: string = DEFAULT_SOCKET_PATH) {
    this.socketPath = socketPath
  }

  /**
   * Check if the server is running
   */
  async isServerRunning(): Promise<boolean> {
    try {
      const response = await this.sendRequest({ action: "ping" })
      return response.success && response.message === "pong"
    } catch {
      return false
    }
  }

  /**
   * Start the server if not already running
   */
  async ensureServerRunning(): Promise<void> {
    if (await this.isServerRunning()) {
      return
    }

    // Check if server binary exists
    if (!existsSync(SERVER_BINARY_PATH)) {
      throw new Error(`Server binary not found at: ${SERVER_BINARY_PATH}`)
    }

    // Start server directly - it's inside a signed app bundle
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn(SERVER_BINARY_PATH, ["--server", "--socket", this.socketPath], {
        detached: true,
        stdio: "ignore"
      })

      this.serverProcess.unref()

      // Wait for server to be ready
      let attempts = 0
      const maxAttempts = 50 // 5 seconds
      const checkInterval = setInterval(async () => {
        attempts++
        if (await this.isServerRunning()) {
          clearInterval(checkInterval)
          resolve()
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval)
          reject(new Error("Server failed to start within 5 seconds"))
        }
      }, 100)
    })
  }

  /**
   * Send a request to the server
   */
  private sendRequest(request: ServerRequest): Promise<ServerResponse> {
    return new Promise((resolve, reject) => {
      const socket: Socket = createConnection(this.socketPath, () => {
        const json = JSON.stringify(request)
        socket.write(json)
      })

      let data = ""

      socket.on("data", (chunk) => {
        data += chunk.toString()
      })

      socket.on("end", () => {
        try {
          const response = JSON.parse(data) as ServerResponse
          resolve(response)
        } catch {
          reject(new Error(`Invalid response from server: ${data}`))
        }
      })

      socket.on("error", (err) => {
        reject(err)
      })

      // Timeout after 10 minutes (for long transcriptions)
      socket.setTimeout(600_000, () => {
        socket.destroy()
        reject(new Error("Request timed out"))
      })
    })
  }

  /**
   * Transcribe an audio file
   */
  async transcribe(audioPath: string, language: string = "en-US"): Promise<ServerResponse> {
    await this.ensureServerRunning()

    return this.sendRequest({
      action: "transcribe",
      audioPath,
      language
    })
  }

  /**
   * Ping the server
   */
  async ping(): Promise<boolean> {
    const response = await this.sendRequest({ action: "ping" })
    return response.success
  }

  /**
   * Shutdown the server
   */
  async shutdown(): Promise<void> {
    try {
      await this.sendRequest({ action: "shutdown" })
    } catch {
      // Server may have already shut down
    }
  }
}

/** Singleton client instance */
let clientInstance: SpeechServerClient | null = null

/**
 * Get the shared client instance
 */
export function getSpeechClient(socketPath?: string): SpeechServerClient {
  if (clientInstance === null) {
    clientInstance = new SpeechServerClient(socketPath)
  }
  return clientInstance
}
