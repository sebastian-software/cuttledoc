/**
 * Detailed statistics for a transcription job
 */

/**
 * Input source statistics
 */
export interface InputStats {
  /** Original file path or URL */
  source: string
  /** File size in bytes */
  sizeBytes: number
  /** Human-readable file size */
  sizeHuman: string
  /** Container format (mp4, webm, mp3, wav, etc.) */
  containerFormat: string
  /** Audio codec (aac, opus, mp3, pcm, etc.) */
  audioCodec: string
  /** Original sample rate in Hz */
  originalSampleRate: number
  /** Original channel count */
  originalChannels: number
  /** Audio duration in seconds */
  durationSeconds: number
  /** Human-readable duration (HH:MM:SS) */
  durationHuman: string
  /** Audio bitrate in kbps (if available) */
  audioBitrateKbps?: number
  /** Whether input was a video file */
  isVideo: boolean
  /** Video resolution if applicable */
  videoResolution?: string
}

/**
 * Audio preprocessing statistics
 */
export interface PreprocessingStats {
  /** Time spent decoding/resampling in seconds */
  processingTimeSeconds: number
  /** Output sample rate (always 16000) */
  outputSampleRate: number
  /** Output channels (always 1 = mono) */
  outputChannels: number
  /** Number of audio samples after preprocessing */
  outputSamples: number
  /** Realtime factor (1.0 = realtime, 0.1 = 10x faster) */
  realtimeFactor: number
}

/**
 * Transcription engine statistics
 */
export interface TranscriptionStats {
  /** Backend used (apple, sherpa, remote) */
  backend: string
  /** Specific model used */
  model: string
  /** Model size in bytes (if local) */
  modelSizeBytes?: number
  /** Time spent on transcription in seconds */
  processingTimeSeconds: number
  /** Realtime factor for transcription */
  realtimeFactor: number
  /** Number of segments produced */
  segmentCount: number
  /** Word count in raw transcript */
  wordCount: number
  /** Character count in raw transcript */
  charCount: number
  /** Detected language (if auto-detected) */
  detectedLanguage?: string
  /** Confidence score (0-1, if available) */
  confidence?: number
}

/**
 * LLM post-processing statistics
 */
export interface LLMProcessingStats {
  /** Whether LLM processing was performed */
  enabled: boolean
  /** LLM provider (ollama, openai, anthropic, etc.) */
  provider?: string
  /** LLM model used */
  model?: string
  /** Processing time in seconds */
  processingTimeSeconds?: number
  /** Input tokens */
  inputTokens?: number
  /** Output tokens */
  outputTokens?: number
  /** Number of words changed */
  wordsChanged?: number
  /** Percentage of words changed */
  changePercentage?: number
  /** Detected corrections (optional detailed list) */
  corrections?: {
    original: string
    corrected: string
    context?: string
  }[]
}

/**
 * Complete job statistics
 */
export interface TranscriptionJobStats {
  /** Unique job ID */
  jobId: string
  /** Job start timestamp (ISO 8601) */
  startedAt: string
  /** Job end timestamp (ISO 8601) */
  completedAt: string
  /** Total wall-clock time in seconds */
  totalTimeSeconds: number
  /** Human-readable total time */
  totalTimeHuman: string

  /** Input file statistics */
  input: InputStats

  /** Preprocessing statistics */
  preprocessing: PreprocessingStats

  /** Transcription statistics */
  transcription: TranscriptionStats

  /** LLM post-processing statistics */
  llmProcessing: LLMProcessingStats

  /** Overall realtime factor (audio duration / total time) */
  overallRealtimeFactor: number

  /** Success status */
  success: boolean

  /** Error message if failed */
  error?: string
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B"
  }
  const units = ["B", "KB", "MB", "GB", "TB"] as const
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  const unit = units[i] ?? "B"
  return `${value.toFixed(1)} ${unit}`
}

/**
 * Format seconds to human-readable duration (HH:MM:SS)
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  const mStr = m.toString().padStart(2, "0")
  const sStr = s.toString().padStart(2, "0")

  if (h > 0) {
    return `${h.toString()}:${mStr}:${sStr}`
  }
  return `${m.toString()}:${sStr}`
}

/**
 * Calculate word diff between two texts
 */
export function calculateWordChanges(
  original: string,
  corrected: string
): { changed: number; total: number; percentage: number } {
  const originalWords = original.toLowerCase().split(/\s+/).filter(Boolean)
  const correctedWords = corrected.toLowerCase().split(/\s+/).filter(Boolean)

  let changed = 0
  const maxLen = Math.max(originalWords.length, correctedWords.length)

  for (let i = 0; i < maxLen; i++) {
    if (originalWords[i] !== correctedWords[i]) {
      changed++
    }
  }

  return {
    changed,
    total: originalWords.length,
    percentage: originalWords.length > 0 ? (changed / originalWords.length) * 100 : 0
  }
}

/**
 * Create a summary report from job stats
 */
export function createSummaryReport(stats: TranscriptionJobStats): string {
  const preprocessSpeed = (1 / stats.preprocessing.realtimeFactor).toFixed(1)
  const transcriptionSpeed = (1 / stats.transcription.realtimeFactor).toFixed(1)
  const overallSpeed = (1 / stats.overallRealtimeFactor).toFixed(1)

  const lines: string[] = [
    "═══════════════════════════════════════════════════════════════",
    "                    TRANSCRIPTION REPORT                        ",
    "═══════════════════════════════════════════════════════════════",
    "",
    "📁 INPUT",
    `   Source:      ${stats.input.source}`,
    `   Size:        ${stats.input.sizeHuman}`,
    `   Format:      ${stats.input.containerFormat} (${stats.input.audioCodec})`,
    `   Duration:    ${stats.input.durationHuman}`,
    stats.input.isVideo && stats.input.videoResolution !== undefined
      ? `   Video:       ${stats.input.videoResolution}`
      : "",
    "",
    "⚙️  PREPROCESSING",
    `   Time:        ${stats.preprocessing.processingTimeSeconds.toFixed(2)}s`,
    `   Speed:       ${preprocessSpeed}x realtime`,
    "",
    "🎤 TRANSCRIPTION",
    `   Backend:     ${stats.transcription.backend}`,
    `   Model:       ${stats.transcription.model}`,
    `   Time:        ${stats.transcription.processingTimeSeconds.toFixed(2)}s`,
    `   Speed:       ${transcriptionSpeed}x realtime`,
    `   Words:       ${stats.transcription.wordCount.toString()}`,
    `   Segments:    ${stats.transcription.segmentCount.toString()}`,
    stats.transcription.confidence !== undefined
      ? `   Confidence:  ${(stats.transcription.confidence * 100).toFixed(1)}%`
      : "",
    ""
  ]

  if (stats.llmProcessing.enabled) {
    const provider = stats.llmProcessing.provider ?? "unknown"
    const model = stats.llmProcessing.model ?? "unknown"
    const time = stats.llmProcessing.processingTimeSeconds?.toFixed(2) ?? "?"
    const words = stats.llmProcessing.wordsChanged?.toString() ?? "?"
    const pct = stats.llmProcessing.changePercentage?.toFixed(1) ?? "?"

    lines.push(
      "🤖 LLM CORRECTION",
      `   Provider:    ${provider}`,
      `   Model:       ${model}`,
      `   Time:        ${time}s`,
      `   Changed:     ${words} words (${pct}%)`,
      ""
    )
  }

  lines.push(
    "═══════════════════════════════════════════════════════════════",
    "📊 SUMMARY",
    `   Total Time:  ${stats.totalTimeHuman}`,
    `   Speed:       ${overallSpeed}x realtime`,
    `   Status:      ${stats.success ? "✅ Success" : "❌ Failed"}`,
    "═══════════════════════════════════════════════════════════════"
  )

  return lines.filter(Boolean).join("\n")
}
