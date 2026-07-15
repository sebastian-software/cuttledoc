#!/usr/bin/env node
/**
 * FFmpeg binary installer
 *
 * Downloads the appropriate FFmpeg binary for the current platform
 * from the Jellyfin project's builds.
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { arch as getArch, platform as getPlatform } from "node:os"
import { dirname, resolve } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"
import { Open } from "unzipper"

const __dirname = dirname(fileURLToPath(import.meta.url))

// FFmpeg version to download
export const FFMPEG_VERSION = "v8.0"

// Binary download URLs (using Jellyfin builds from node-av releases)
const DOWNLOAD_BASE = "https://github.com/seydx/node-av/releases/download/v5.0.3"

// SHA-256 digests published by GitHub for the pinned v5.0.3 release assets.
export const BINARIES = {
  darwin: {
    x64: {
      filename: `ffmpeg-${FFMPEG_VERSION}-macos-x64-jellyfin.zip`,
      sha256: "11006df84fca773b1a5865e59c979c78ac913b23e2bd06397e01536a6f133ce6"
    },
    arm64: {
      filename: `ffmpeg-${FFMPEG_VERSION}-macos-arm64-jellyfin.zip`,
      sha256: "f9a4854262a6eee865ceb1da6f28f83d32e0c19c62f7037ffc8119e8c5aeb731"
    }
  },
  linux: {
    x64: {
      filename: `ffmpeg-${FFMPEG_VERSION}-linux-x64-jellyfin.zip`,
      sha256: "5e59957cea3cde9f9ff340dc4c36fa32098e6fae88d09d5fd8d4a8bd6a9e835c"
    },
    arm64: {
      filename: `ffmpeg-${FFMPEG_VERSION}-linux-arm64-jellyfin.zip`,
      sha256: "084d1669db70b9dcb90c3af2ca5b34413f357ea1b78b3f19003f0e38fb935b22"
    }
  },
  win32: {
    x64: {
      filename: `ffmpeg-${FFMPEG_VERSION}-win-x64.zip`,
      sha256: "5c1c9bedf084009fd144a996638efbb845c29d04dd60fcae08b3fcf23ab5cd83"
    },
    arm64: {
      filename: `ffmpeg-${FFMPEG_VERSION}-win-arm64.zip`,
      sha256: "023785ba890b7b306c234cbfa024eefc2877eff4bfd08a45193fd2fcf4c133eb"
    }
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
 * Download a file while hashing it and respecting stream backpressure.
 */
export async function downloadFile(url, destPath, expectedSha256, options = {}) {
  const { fetchImpl = fetch, showProgress = !process.env.CI } = options

  console.log(`Downloading from ${url}...`)

  const response = await fetchImpl(url, { redirect: "follow" })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  if (!response.body) {
    throw new Error("Download response has no body")
  }

  const contentLength = response.headers.get("content-length")
  const total = contentLength ? Number.parseInt(contentLength, 10) : 0
  const hash = createHash("sha256")
  let downloaded = 0
  let lastPercent = -1

  const hashAndReportProgress = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      downloaded += chunk.length

      if (showProgress && total > 0) {
        const percent = Math.round((downloaded / total) * 100)
        if (percent !== lastPercent) {
          lastPercent = percent
          process.stdout.write(`\rDownloading... ${percent}%`)
        }
      }

      callback(null, chunk)
    }
  })

  rmSync(destPath, { force: true })

  try {
    await pipeline(Readable.fromWeb(response.body), hashAndReportProgress, createWriteStream(destPath, { flags: "wx" }))

    if (showProgress && total > 0) {
      process.stdout.write("\n")
    }

    const actualSha256 = hash.digest("hex")
    if (actualSha256 !== expectedSha256) {
      throw new Error(`Checksum mismatch for ${url}: expected ${expectedSha256}, received ${actualSha256}`)
    }
  } catch (error) {
    rmSync(destPath, { force: true })
    throw error
  }
}

/**
 * Find the one file entry whose basename exactly matches the executable.
 */
export function findExecutableEntry(files, executableName) {
  const matches = files.filter((file) => {
    if (file.type !== "File") return false
    const normalizedPath = file.path.replaceAll("\\", "/")
    return normalizedPath.split("/").at(-1) === executableName
  })

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${executableName} file in ZIP archive, found ${matches.length}`)
  }

  return matches[0]
}

/**
 * Extract only the expected executable to a temporary path.
 */
export async function extractExecutable(directory, executableName, tempPath) {
  const files = directory.files ?? []
  const entry = findExecutableEntry(files, executableName)

  rmSync(tempPath, { force: true })

  try {
    await pipeline(entry.stream(), createWriteStream(tempPath, { flags: "wx" }))
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  }
}

/**
 * Validate that the binary can execute successfully.
 */
export function validateBinary(executablePath) {
  try {
    execFileSync(executablePath, ["-version"], { stdio: "ignore", timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

/**
 * Include the version, asset, and checksum so any pinned artifact change
 * invalidates an existing installation.
 */
export function getInstallMarker(asset) {
  return `${FFMPEG_VERSION}\n${asset.filename}\n${asset.sha256}\n`
}

/**
 * Existing files are reusable only when their marker matches and the binary runs.
 */
export function isCurrentInstall(executablePath, markerPath, expectedMarker, validator = validateBinary) {
  if (!existsSync(executablePath) || !existsSync(markerPath)) {
    return false
  }

  try {
    return readFileSync(markerPath, "utf8") === expectedMarker && validator(executablePath)
  } catch {
    return false
  }
}

/**
 * Main install function
 */
export async function install() {
  const platform = getNormalizedPlatform()
  const arch = getNormalizedArch()

  console.log(`Platform: ${platform}/${arch}`)

  const asset = BINARIES[platform]?.[arch]
  if (!asset) {
    console.warn(`No FFmpeg binary available for ${platform}/${arch}`)
    console.warn("You can install FFmpeg manually and set FFMPEG_PATH")
    return
  }

  const binaryDir = resolve(__dirname, "..", "binary")
  const executableName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  const executablePath = resolve(binaryDir, executableName)
  const markerPath = resolve(binaryDir, ".ffmpeg-install")
  const expectedMarker = getInstallMarker(asset)

  if (isCurrentInstall(executablePath, markerPath, expectedMarker)) {
    console.log(`FFmpeg ${FFMPEG_VERSION} is already installed and valid`)
    return
  }

  mkdirSync(binaryDir, { recursive: true })

  const tempSuffix = `${process.pid}-${Date.now()}`
  const zipTempPath = resolve(binaryDir, `.${asset.filename}.${tempSuffix}.tmp`)
  const executableTempPath = resolve(binaryDir, `.${executableName}.${tempSuffix}.tmp`)
  const markerTempPath = resolve(binaryDir, `.ffmpeg-install.${tempSuffix}.tmp`)

  try {
    const downloadUrl = `${DOWNLOAD_BASE}/${asset.filename}`
    await downloadFile(downloadUrl, zipTempPath, asset.sha256)

    console.log("Extracting...")
    const directory = await Open.file(zipTempPath)
    await extractExecutable(directory, executableName, executableTempPath)

    if (platform !== "win32") {
      console.log("Making executable...")
      chmodSync(executableTempPath, 0o755)
    }

    if (!validateBinary(executableTempPath)) {
      throw new Error("Extracted FFmpeg binary failed the ffmpeg -version validation")
    }

    renameSync(executableTempPath, executablePath)
    writeFileSync(markerTempPath, expectedMarker, { flag: "wx" })
    renameSync(markerTempPath, markerPath)

    console.log(`FFmpeg ${FFMPEG_VERSION} installed successfully!`)
  } finally {
    rmSync(zipTempPath, { force: true })
    rmSync(executableTempPath, { force: true })
    rmSync(markerTempPath, { force: true })
  }
}

function isDirectExecution() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  if (process.env.SKIP_FFMPEG === "true") {
    console.log("Skipping FFmpeg download (SKIP_FFMPEG=true)")
  } else {
    install().catch((error) => {
      console.warn("Warning: Failed to install FFmpeg binary:", error.message)
      console.warn("You can install FFmpeg manually: brew install ffmpeg (macOS)")
      console.warn("Or set FFMPEG_PATH environment variable")
      // Don't fail the install
      process.exitCode = 0
    })
  }
}
