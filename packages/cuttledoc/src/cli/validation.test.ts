import { describe, expect, it } from "vitest"

import { parseArgs } from "./args.js"
import { validateTranscribeArgs } from "./validation.js"

describe("validateTranscribeArgs", () => {
  it("accepts every supported backend", () => {
    for (const backend of ["auto", "parakeet", "whisper", "openai"]) {
      expect(validateTranscribeArgs(parseArgs(["audio.mp3", "--backend", backend])).backend).toBe(backend)
    }
  })

  it("rejects an invalid backend and lists the valid choices", () => {
    expect(() => validateTranscribeArgs(parseArgs(["audio.mp3", "--backend", "whipser"]))).toThrow(
      'Invalid --backend "whipser". Valid values: auto, parakeet, whisper, openai'
    )
  })

  it("accepts OpenAI speech models only with the OpenAI backend", () => {
    expect(
      validateTranscribeArgs(parseArgs(["audio.mp3", "--backend", "openai", "--model", "gpt-4o-mini-transcribe"]))
        .speechModel
    ).toBe("gpt-4o-mini-transcribe")

    expect(() => validateTranscribeArgs(parseArgs(["audio.mp3", "--model", "gpt-4o-transcribe"]))).toThrow(
      "--model is only supported with --backend openai"
    )
    expect(() => validateTranscribeArgs(parseArgs(["audio.mp3", "--backend", "openai", "--model", "whisper"]))).toThrow(
      'Invalid --model "whisper". Valid values: gpt-4o-transcribe, gpt-4o-mini-transcribe'
    )
  })

  it("accepts and routes provider-specific LLM model IDs", () => {
    expect(validateTranscribeArgs(parseArgs(["audio.mp3", "--llm-model", "phi4:14b"]))).toMatchObject({
      llmModel: "phi4:14b",
      llmProvider: "ollama"
    })
    expect(validateTranscribeArgs(parseArgs(["audio.mp3", "--llm-model", "phi4-mini"]))).toMatchObject({
      llmModel: "phi4-mini",
      llmProvider: "local"
    })
    expect(validateTranscribeArgs(parseArgs(["audio.mp3", "--llm-model", "gpt-5-mini"]))).toMatchObject({
      llmModel: "gpt-5-mini",
      llmProvider: "openai"
    })
  })

  it("keeps provider auto-detection for model IDs shared by local and Ollama", () => {
    expect(validateTranscribeArgs(parseArgs(["audio.mp3", "--llm-model", "gemma3n:e4b"]))).toMatchObject({
      llmModel: "gemma3n:e4b",
      llmProvider: undefined
    })
  })

  it("rejects unknown LLM models instead of replacing them", () => {
    expect(() => validateTranscribeArgs(parseArgs(["audio.mp3", "--llm-model", "unknown:latest"]))).toThrow(
      'Invalid --llm-model "unknown:latest". Valid values:'
    )
  })

  it("rejects options and positional inputs that would otherwise be ignored", () => {
    expect(() => validateTranscribeArgs(parseArgs(["audio.mp3", "--no-correct", "--llm-model", "phi4:14b"]))).toThrow(
      "--llm-model cannot be used with --no-correct"
    )
    expect(() => validateTranscribeArgs(parseArgs(["first.mp3", "second.mp3"]))).toThrow(
      "Expected one input file, received 2"
    )
  })
})
