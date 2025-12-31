/**
 * FFmpeg binary path utilities
 */

import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { platform, arch } from "node:os"

// Support both ESM and CJS
const getModuleDir = (): string => {
  // Try ESM approach first
  if (typeof import.meta !== "undefined" && import.meta.url) {
    return dirname(fileURLToPath(import.meta.url))
  }
  // Fallback for CJS
  return __dirname
}

const moduleDir = getModuleDir()

/** FFmpeg version bundled with this package */
export const FFMPEG_VERSION = "8.0"

/**
 * Get the current platform identifier
 */
export function getPlatform(): "darwin" | "linux" | "win32" {
  const p = platform()
  if (p === "darwin" || p === "linux" || p === "win32") {
    return p
  }
  throw new Error(`Unsupported platform: ${p}`)
}

/**
 * Get the current architecture
 */
export function getArchitecture(): "x64" | "arm64" {
  const a = arch()
  if (a === "x64" || a === "arm64") {
    return a
  }
  throw new Error(`Unsupported architecture: ${a}. Supported: x64, arm64`)
}

/**
 * Get the path to the FFmpeg binary directory
 */
function getBinaryDir(): string {
  // In dist/binary.js, go up to package root then into binary/
  return resolve(moduleDir, "..", "binary")
}

/**
 * Get the FFmpeg executable filename for the current platform
 */
function getExecutableName(): string {
  return getPlatform() === "win32" ? "ffmpeg.exe" : "ffmpeg"
}

/**
 * Get the absolute path to the FFmpeg binary.
 *
 * @returns Absolute path to the FFmpeg executable
 * @throws Error if the binary is not available
 *
 * @example
 * ```typescript
 * import { ffmpegPath } from '@cuttledoc/ffmpeg'
 * import { execFile } from 'node:child_process'
 *
 * execFile(ffmpegPath(), ['-version'], (err, stdout) => {
 *   console.log(stdout)
 * })
 * ```
 */
export function ffmpegPath(): string {
  const path = resolve(getBinaryDir(), getExecutableName())
  if (!existsSync(path)) {
    throw new Error(
      `FFmpeg binary not found at ${path}. ` +
        "Try reinstalling @cuttledoc/ffmpeg or set FFMPEG_PATH environment variable."
    )
  }
  return path
}

/**
 * Check if the FFmpeg binary is available.
 *
 * @returns true if FFmpeg is available, false otherwise
 */
export function isFFmpegAvailable(): boolean {
  try {
    const path = resolve(getBinaryDir(), getExecutableName())
    return existsSync(path)
  } catch {
    return false
  }
}

/**
 * Get the FFmpeg version string.
 *
 * @returns FFmpeg version (e.g., "8.0")
 */
export function ffmpegVersion(): string {
  return FFMPEG_VERSION
}
