import { execSync } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync } from "node:fs"
import { get } from "node:https"
import { join } from "node:path"
import { pipeline } from "node:stream/promises"

import { SHERPA_MODELS, type SherpaModelType } from "./types.js"

/**
 * Get the models directory path
 */
export function getModelsDir(): string {
  return (
    process.env["CUTTLEDOC_MODELS_DIR"] ?? process.env["LOCAL_TRANSCRIBE_MODELS_DIR"] ?? join(process.cwd(), "models")
  )
}

/**
 * Check if a model is already downloaded
 */
export function isModelDownloaded(modelType: SherpaModelType): boolean {
  const modelInfo = SHERPA_MODELS[modelType]

  const modelsDir = getModelsDir()
  const modelDir = join(modelsDir, modelInfo.folderName)

  // Check if the model directory exists and has the required files
  if (!existsSync(modelDir)) {
    return false
  }

  const tokensPath = join(modelDir, modelInfo.files.tokens)
  return existsSync(tokensPath)
}

/**
 * Validate that a model type is valid
 */
function isValidModelType(modelType: string): modelType is SherpaModelType {
  return modelType in SHERPA_MODELS
}

/**
 * Download and extract a sherpa-onnx model
 */
export async function downloadSherpaModel(
  modelType: string,
  options: { onProgress?: (progress: { downloaded: number; total: number }) => void } = {}
): Promise<void> {
  if (!isValidModelType(modelType)) {
    throw new Error(`Unknown model: ${modelType}. Available models: ${Object.keys(SHERPA_MODELS).join(", ")}`)
  }

  const modelInfo = SHERPA_MODELS[modelType]

  // Check if already downloaded
  if (isModelDownloaded(modelType)) {
    return
  }

  const modelsDir = getModelsDir()

  // Create models directory if it doesn't exist
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true })
  }

  if (modelInfo.source === "huggingface") {
    await downloadFromHuggingFace(modelInfo, modelsDir, options.onProgress)
  } else {
    await downloadFromGitHub(modelInfo, modelsDir, options.onProgress)
  }
}

/**
 * Download model from GitHub releases (tar.bz2 archive)
 */
async function downloadFromGitHub(
  modelInfo: (typeof SHERPA_MODELS)[SherpaModelType],
  modelsDir: string,
  onProgress?: (progress: { downloaded: number; total: number }) => void
): Promise<void> {
  const archivePath = join(modelsDir, `${modelInfo.folderName}.tar.bz2`)

  // Download the archive
  await downloadFile(modelInfo.downloadUrl, archivePath, onProgress)

  // Extract the archive
  try {
    // Use tar command for extraction (available on macOS and Linux)
    execSync(`tar -xjf "${archivePath}" -C "${modelsDir}"`, {
      stdio: "pipe"
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract model archive: ${errorMessage}`)
  }

  // Clean up the archive
  try {
    execSync(`rm "${archivePath}"`, { stdio: "pipe" })
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Download model from Hugging Face (individual files)
 */
async function downloadFromHuggingFace(
  modelInfo: (typeof SHERPA_MODELS)[SherpaModelType],
  modelsDir: string,
  onProgress?: (progress: { downloaded: number; total: number }) => void
): Promise<void> {
  const modelDir = join(modelsDir, modelInfo.folderName)

  // Create model directory
  if (!existsSync(modelDir)) {
    mkdirSync(modelDir, { recursive: true })
  }

  // Files to download
  const filesToDownload = [
    modelInfo.files.encoder,
    modelInfo.files.decoder,
    modelInfo.files.tokens,
    ...(modelInfo.files.joiner !== undefined ? [modelInfo.files.joiner] : [])
  ]

  // Calculate total size for progress
  let totalDownloaded = 0
  const totalSize = modelInfo.sizeBytes

  for (const fileName of filesToDownload) {
    const fileUrl = `https://huggingface.co/${modelInfo.downloadUrl}/resolve/main/${fileName}`
    const destPath = join(modelDir, fileName)

    // Skip if file already exists
    if (existsSync(destPath)) {
      continue
    }

    await downloadFile(fileUrl, destPath, (progress) => {
      if (onProgress !== undefined) {
        onProgress({
          downloaded: totalDownloaded + progress.downloaded,
          total: totalSize
        })
      }
    })

    // Update total for next file
    const { statSync } = await import("node:fs")
    try {
      totalDownloaded += statSync(destPath).size
    } catch {
      // Ignore stat errors
    }
  }
}

/**
 * Download a file from a URL with redirect following
 */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (progress: { downloaded: number; total: number }) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl: string, redirectCount = 0): void => {
      if (redirectCount > 10) {
        reject(new Error("Too many redirects"))
        return
      }

      get(requestUrl, (response) => {
        const statusCode = response.statusCode ?? 0

        // Handle redirects
        if (
          (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) &&
          response.headers.location !== undefined
        ) {
          makeRequest(response.headers.location, redirectCount + 1)
          return
        }

        if (statusCode !== 200) {
          reject(new Error(`HTTP ${String(statusCode)}: Failed to download ${requestUrl}`))
          return
        }

        const totalSize = parseInt(response.headers["content-length"] ?? "0", 10)
        let downloadedSize = 0

        const fileStream = createWriteStream(destPath)

        response.on("data", (chunk: Buffer) => {
          downloadedSize += chunk.length
          if (onProgress !== undefined) {
            onProgress({ downloaded: downloadedSize, total: totalSize })
          }
        })

        pipeline(response, fileStream)
          .then(() => {
            resolve()
          })
          .catch(reject)
      }).on("error", reject)
    }

    makeRequest(url)
  })
}

/**
 * Available model info for listing
 */
interface AvailableModelInfo {
  id: SherpaModelType
  type: string
  languages: readonly string[]
  sizeBytes: number
  isDownloaded: boolean
}

/**
 * Get list of available models with their info
 */
export function getAvailableModels(): AvailableModelInfo[] {
  return Object.entries(SHERPA_MODELS).map(([id, info]) => ({
    id: id as SherpaModelType,
    type: info.type,
    languages: info.languages,
    sizeBytes: info.sizeBytes,
    isDownloaded: isModelDownloaded(id as SherpaModelType)
  }))
}
