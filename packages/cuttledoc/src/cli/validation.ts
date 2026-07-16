import { LOCAL_MODELS, OLLAMA_MODELS, OPENAI_MODELS, type LLMProvider } from "@cuttledoc/llm"

import { BACKEND_TYPES, OPENAI_TRANSCRIBE_MODELS, type BackendType } from "../types.js"
import type { CLIArgs } from "./args.js"

const VALID_BACKENDS = Object.values(BACKEND_TYPES)
const VALID_SPEECH_MODELS = Object.values(OPENAI_TRANSCRIBE_MODELS)
const VALID_LLM_MODELS = [
  ...new Set([...Object.keys(LOCAL_MODELS), ...Object.keys(OLLAMA_MODELS), ...Object.keys(OPENAI_MODELS)])
]

export interface ValidatedTranscribeArgs {
  backend: BackendType
  llmModel: string
  llmProvider: LLMProvider | undefined
  speechModel: string | undefined
}

function inferLLMProvider(model: string): LLMProvider | undefined {
  const providers: LLMProvider[] = []
  if (model in LOCAL_MODELS) providers.push("local")
  if (model in OLLAMA_MODELS) providers.push("ollama")
  if (model in OPENAI_MODELS) providers.push("openai")
  return providers.length === 1 ? providers[0] : undefined
}

export function validateTranscribeArgs(args: CLIArgs): ValidatedTranscribeArgs {
  const backend = args.backend ?? BACKEND_TYPES.auto
  if (!VALID_BACKENDS.includes(backend as BackendType)) {
    throw new Error(`Invalid --backend "${backend}". Valid values: ${VALID_BACKENDS.join(", ")}`)
  }

  if (args.positional.length > 1) {
    throw new Error(`Expected one input file, received ${args.positional.length.toString()}`)
  }

  if (args.model !== undefined && backend !== BACKEND_TYPES.openai) {
    throw new Error("--model is only supported with --backend openai; local backends use their bundled model")
  }

  if (args.model !== undefined && !VALID_SPEECH_MODELS.includes(args.model as (typeof VALID_SPEECH_MODELS)[number])) {
    throw new Error(`Invalid --model "${args.model}". Valid values: ${VALID_SPEECH_MODELS.join(", ")}`)
  }

  if (!args.correct && args.llmModel !== undefined) {
    throw new Error("--llm-model cannot be used with --no-correct")
  }

  const llmModel = args.llmModel ?? "gemma3n:e4b"
  if (!VALID_LLM_MODELS.includes(llmModel)) {
    throw new Error(`Invalid --llm-model "${llmModel}". Valid values: ${VALID_LLM_MODELS.join(", ")}`)
  }

  return {
    backend: backend as BackendType,
    llmModel,
    llmProvider: inferLLMProvider(llmModel),
    speechModel: args.model
  }
}
