/**
 * Audio chunking for Apple's on-device speech recognition
 *
 * Apple's on-device recognition has a ~1 minute limit.
 * This module splits longer audio at natural speech pauses.
 */

import { exec } from "node:child_process"
import { mkdir, readdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

const execAsync = promisify(exec)

/** Maximum chunk duration in seconds (Apple on-device limit varies, 30s is safe) */
const MAX_CHUNK_DURATION = 30

/** Minimum silence duration to consider as a split point */
const MIN_SILENCE_DURATION = 0.3

/** Silence detection threshold in dB */
const SILENCE_THRESHOLD = -30

interface SilenceSegment {
  start: number
  end: number
  duration: number
}

interface ChunkInfo {
  path: string
  startTime: number
  endTime: number
}

/**
 * Get audio duration in seconds
 */
export async function getAudioDuration(audioPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
  )
  return parseFloat(stdout.trim())
}

/**
 * Detect silence segments in audio
 */
async function detectSilence(audioPath: string): Promise<SilenceSegment[]> {
  const { stderr } = await execAsync(
    `ffmpeg -i "${audioPath}" -af silencedetect=noise=${SILENCE_THRESHOLD}dB:d=${MIN_SILENCE_DURATION} -f null - 2>&1`
  )

  const segments: SilenceSegment[] = []
  const lines = stderr.split("\n")

  let currentStart: number | null = null

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/)
    const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/)

    if (startMatch) {
      currentStart = parseFloat(startMatch[1])
    } else if (endMatch && currentStart !== null) {
      segments.push({
        start: currentStart,
        end: parseFloat(endMatch[1]),
        duration: parseFloat(endMatch[2])
      })
      currentStart = null
    }
  }

  return segments
}

/**
 * Find optimal split points based on silence segments
 */
function findSplitPoints(duration: number, silenceSegments: SilenceSegment[]): number[] {
  if (duration <= MAX_CHUNK_DURATION) {
    return [] // No splitting needed
  }

  const splitPoints: number[] = []
  let currentChunkStart = 0

  while (currentChunkStart + MAX_CHUNK_DURATION < duration) {
    const targetSplit = currentChunkStart + MAX_CHUNK_DURATION

    // Find the best silence segment near the target split point
    // Prefer silences that are closer to the target but before it
    let bestSplit = targetSplit
    let bestScore = Infinity

    for (const seg of silenceSegments) {
      const splitPoint = seg.start + seg.duration / 2 // Split in middle of silence

      // Only consider silences between current chunk start + 30s and target + 10s
      if (splitPoint > currentChunkStart + 30 && splitPoint < targetSplit + 10) {
        // Score: distance from target (prefer closer to target)
        const score = Math.abs(splitPoint - targetSplit)
        if (score < bestScore) {
          bestScore = score
          bestSplit = splitPoint
        }
      }
    }

    splitPoints.push(bestSplit)
    currentChunkStart = bestSplit
  }

  return splitPoints
}

/**
 * Split audio file into chunks at specified points
 */
async function splitAudio(audioPath: string, splitPoints: number[], outputDir: string): Promise<ChunkInfo[]> {
  const duration = await getAudioDuration(audioPath)
  const chunks: ChunkInfo[] = []

  // Create output directory
  await mkdir(outputDir, { recursive: true })

  const allPoints = [0, ...splitPoints, duration]

  for (let i = 0; i < allPoints.length - 1; i++) {
    const startTime = allPoints[i]
    const endTime = allPoints[i + 1]
    const chunkPath = join(outputDir, `chunk_${i.toString().padStart(3, "0")}.wav`)

    // Extract chunk as WAV (better compatibility with Apple Speech)
    await execAsync(
      `ffmpeg -y -i "${audioPath}" -ss ${startTime} -to ${endTime} -ar 16000 -ac 1 "${chunkPath}" 2>/dev/null`
    )

    chunks.push({
      path: chunkPath,
      startTime,
      endTime
    })
  }

  return chunks
}

/**
 * Check if audio needs chunking (longer than max duration)
 */
export async function needsChunking(audioPath: string): Promise<boolean> {
  const duration = await getAudioDuration(audioPath)
  return duration > MAX_CHUNK_DURATION
}

/**
 * Prepare audio for transcription - chunk if needed
 * Returns array of chunk paths with their time offsets
 */
export async function prepareAudioChunks(audioPath: string): Promise<ChunkInfo[]> {
  const duration = await getAudioDuration(audioPath)

  // Short audio doesn't need chunking
  if (duration <= MAX_CHUNK_DURATION) {
    return [{ path: audioPath, startTime: 0, endTime: duration }]
  }

  // Detect silence for smart splitting
  const silenceSegments = await detectSilence(audioPath)

  // Find optimal split points
  const splitPoints = findSplitPoints(duration, silenceSegments)

  // Create temp directory for chunks
  const tempDir = `/tmp/cuttledoc-chunks-${Date.now()}`

  // Split audio
  const chunks = await splitAudio(audioPath, splitPoints, tempDir)

  return chunks
}

/**
 * Clean up temporary chunk files
 */
export async function cleanupChunks(chunks: ChunkInfo[]): Promise<void> {
  if (chunks.length <= 1) return // No temp files to clean

  // Get the temp directory from first chunk
  const tempDir = join(chunks[0].path, "..")

  try {
    // Check if it's our temp directory
    if (tempDir.includes("cuttledoc-chunks-")) {
      await rm(tempDir, { recursive: true, force: true })
    }
  } catch {
    // Ignore cleanup errors
  }
}
