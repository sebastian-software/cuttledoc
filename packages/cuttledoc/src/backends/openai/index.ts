/**
 * OpenAI Cloud ASR Backend
 *
 * Uses OpenAI's next-generation transcription models (gpt-4o-transcribe, gpt-4o-mini-transcribe)
 * which offer improved WER over the original Whisper models.
 *
 * @see https://openai.com/index/introducing-our-next-generation-audio-models/
 * @see https://platform.openai.com/docs/guides/speech-to-text
 */

import * as fs from "node:fs"
import * as path from "node:path"
import { performance } from "node:perf_hooks"
import {
  BACKEND_TYPES,
  OPENAI_TRANSCRIBE_MODELS,
  type Backend,
  type OpenAITranscribeModel,
  type TranscribeOptions,
  type TranscriptionResult
} from "../../types.js"

const OPENAI_API_URL = "https://api.openai.com/v1/audio/transcriptions"

/**
 * Default model for OpenAI transcription
 */
export const DEFAULT_OPENAI_MODEL: OpenAITranscribeModel = "gpt-4o-transcribe"

/**
 * OpenAI transcription backend
 *
 * Requires an OpenAI API key (via options.apiKey or OPENAI_API_KEY env var)
 */
export class OpenAIBackend implements Backend {
  private apiKey: string | null = null
  private model: OpenAITranscribeModel = DEFAULT_OPENAI_MODEL

  constructor(options?: { apiKey?: string | undefined; model?: OpenAITranscribeModel }) {
    this.apiKey = options?.apiKey ?? process.env["OPENAI_API_KEY"] ?? null
    this.model = options?.model ?? DEFAULT_OPENAI_MODEL
  }

  isAvailable(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0
  }

  async initialize(): Promise<void> {
    // No initialization needed for cloud backend
  }

  async transcribe(audioPath: string, options: TranscribeOptions = {}): Promise<TranscriptionResult> {
    const apiKey = options.apiKey ?? this.apiKey ?? process.env["OPENAI_API_KEY"]
    if (!apiKey) {
      throw new Error(
        "OpenAI API key required. Provide via options.apiKey, constructor, or OPENAI_API_KEY environment variable."
      )
    }

    const model = (options.model as OpenAITranscribeModel) ?? this.model

    // Validate model
    if (!Object.values(OPENAI_TRANSCRIBE_MODELS).includes(model)) {
      throw new Error(
        `Invalid OpenAI model: ${model}. Valid models: ${Object.values(OPENAI_TRANSCRIBE_MODELS).join(", ")}`
      )
    }

    // Check file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`)
    }

    const startTime = performance.now()

    // Create form data for multipart upload
    const formData = new FormData()

    // Read file and create blob
    const fileBuffer = fs.readFileSync(audioPath)
    const fileName = path.basename(audioPath)
    const mimeType = getMimeType(audioPath)
    const blob = new Blob([fileBuffer], { type: mimeType })

    formData.append("file", blob, fileName)
    formData.append("model", model)

    // Add language if specified
    if (options.language) {
      formData.append("language", options.language)
    }

    // Note: gpt-4o-transcribe models only support 'json' or 'text' format
    // 'verbose_json' (with timestamps) is only supported by whisper-1
    formData.append("response_format", "json")

    // Make API request
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`)
    }

    const result = (await response.json()) as OpenAITranscriptionResponse

    const processingTimeSeconds = (performance.now() - startTime) / 1000

    // gpt-4o-transcribe returns only text in json format, no segments/timestamps
    const segments = result.segments
      ? result.segments.map((seg) => {
          const base = {
            text: seg.text,
            startSeconds: seg.start,
            endSeconds: seg.end
          }
          if (seg.avg_logprob !== undefined) {
            return { ...base, confidence: Math.exp(seg.avg_logprob) }
          }
          return base
        })
      : [{ text: result.text, startSeconds: 0, endSeconds: 0 }]

    return {
      text: result.text,
      segments,
      words:
        result.words?.map((word) => ({
          word: word.word,
          startSeconds: word.start,
          endSeconds: word.end
        })) ?? [],
      durationSeconds: result.duration ?? 0,
      processingTimeSeconds,
      language: result.language ?? options.language ?? "auto",
      backend: BACKEND_TYPES.openai
    }
  }

  async dispose(): Promise<void> {
    // No cleanup needed for cloud backend
  }
}

/**
 * OpenAI transcription API response format (verbose_json)
 */
interface OpenAITranscriptionResponse {
  text: string
  language?: string
  duration?: number
  segments?: Array<{
    id: number
    seek: number
    start: number
    end: number
    text: string
    tokens: number[]
    temperature: number
    avg_logprob?: number
    compression_ratio: number
    no_speech_prob: number
  }>
  words?: Array<{
    word: string
    start: number
    end: number
  }>
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac"
  }
  return mimeTypes[ext] ?? "audio/mpeg"
}
