#!/usr/bin/env node
/**
 * FFmpeg binary installer
 *
 * Downloads the appropriate FFmpeg binary for the current platform
 * from the Jellyfin project's builds.
 */

import { chmodSync, createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { arch as getArch, platform as getPlatform } from "node:os"
import { Open } from "unzipper"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Skip if SKIP_FFMPEG is set
if (process.env.SKIP_FFMPEG === "true") {
  console.log("Skipping FFmpeg download (SKIP_FFMPEG=true)")
  process.exit(0)
}

// FFmpeg version to download
const FFMPEG_VERSION = "v8.0"

// Binary download URLs (using Jellyfin builds from node-av releases)
const DOWNLOAD_BASE = "https://github.com/seydx/node-av/releases/download/v5.0.3"

const BINARIES = {
  darwin: {
    x64: `ffmpeg-${FFMPEG_VERSION}-macos-x64-jellyfin.zip`,
    arm64: `ffmpeg-${FFMPEG_VERSION}-macos-arm64-jellyfin.zip`
  },
  linux: {
    x64: `ffmpeg-${FFMPEG_VERSION}-linux-x64-jellyfin.zip`,
    arm64: `ffmpeg-${FFMPEG_VERSION}-linux-arm64-jellyfin.zip`
  },
  win32: {
    x64: `ffmpeg-${FFMPEG_VERSION}-win-x64.zip`,
    arm64: `ffmpeg-${FFMPEG_VERSION}-win-arm64.zip`
  }
}

/**
 * Get normalized platform
 */
function getNormalizedPlatform() {
  const p = getPlatform()
  if (p === "darwin" || p === "linux" || p === "win32") {
    return p
  }
  throw new Error(`Unsupported platform: ${p}`)
}

/**
 * Get normalized architecture
 */
function getNormalizedArch() {
  const a = getArch()
  if (a === "x64" || a === "arm64") {
    return a
  }
  if (a === "x86_64") return "x64"
  if (a === "aarch64") return "arm64"
  throw new Error(`Unsupported architecture: ${a}`)
}

/**
 * Download a file with progress
 */
async function downloadFile(url, destPath) {
  console.log(`Downloading from ${url}...`)

  const response = await fetch(url, { redirect: "follow" })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const contentLength = response.headers.get("content-length")
  const total = contentLength ? parseInt(contentLength, 10) : 0

  const writeStream = createWriteStream(destPath)
  const reader = response.body.getReader()

  let downloaded = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      writeStream.write(value)
      downloaded += value.length

      if (total > 0 && !process.env.CI) {
        const percent = Math.round((downloaded / total) * 100)
        process.stdout.write(`\rDownloading... ${percent}%`)
      }
    }

    if (!process.env.CI) {
      process.stdout.write("\n")
    }
  } finally {
    reader.releaseLock()
    writeStream.end()
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve)
      writeStream.on("error", reject)
    })
  }
}

/**
 * Main install function
 */
async function install() {
  const platform = getNormalizedPlatform()
  const arch = getNormalizedArch()

  console.log(`Platform: ${platform}/${arch}`)

  const filename = BINARIES[platform]?.[arch]
  if (!filename) {
    console.warn(`No FFmpeg binary available for ${platform}/${arch}`)
    console.warn("You can install FFmpeg manually and set FFMPEG_PATH")
    process.exit(0)
  }

  const binaryDir = resolve(__dirname, "..", "binary")
  const zipPath = resolve(binaryDir, filename)
  const executableName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  const executablePath = resolve(binaryDir, executableName)

  // Skip if already installed
  if (existsSync(executablePath)) {
    console.log("FFmpeg binary already installed")
    return
  }

  // Create binary directory
  mkdirSync(binaryDir, { recursive: true })

  // Download
  const downloadUrl = `${DOWNLOAD_BASE}/${filename}`
  await downloadFile(downloadUrl, zipPath)

  // Extract
  console.log("Extracting...")
  const directory = await Open.file(zipPath)

  if (!directory.files || directory.files.length === 0) {
    throw new Error("ZIP archive is empty")
  }

  await new Promise((resolve, reject) => {
    directory.files[0].stream().pipe(createWriteStream(executablePath)).on("error", reject).on("finish", resolve)
  })

  // Cleanup ZIP
  rmSync(zipPath)

  // Make executable on Unix
  if (platform !== "win32") {
    console.log("Making executable...")
    chmodSync(executablePath, 0o755)
  }

  console.log(`FFmpeg ${FFMPEG_VERSION} installed successfully!`)
}

// Run
install().catch((error) => {
  console.warn("Warning: Failed to install FFmpeg binary:", error.message)
  console.warn("You can install FFmpeg manually: brew install ffmpeg (macOS)")
  console.warn("Or set FFMPEG_PATH environment variable")
  // Don't fail the install
  process.exit(0)
})
