<p align="center">
  <img src="packages/docs/app/assets/logo.svg" width="150" height="150" alt="cuttledoc logo">
</p>

<h1 align="center">cuttledoc</h1>

<p align="center">
  <strong>Turn audio and video into accurate, ready-to-use text.</strong>
</p>

<p align="center">
  A Node.js CLI and TypeScript library for private local transcription on Apple Silicon<br>
  or cloud transcription with OpenAI — with optional AI correction and Markdown formatting.
</p>

<p align="center">
  <a href="https://sebastian-software.github.io/cuttledoc/">Documentation</a> ·
  <a href="https://sebastian-software.github.io/cuttledoc/docs/cli">CLI reference</a> ·
  <a href="https://sebastian-software.github.io/cuttledoc/docs/backends">Choose a backend</a> ·
  <a href="https://sebastian-software.github.io/cuttledoc/docs/benchmarks">Benchmarks</a>
</p>

<p align="center">
  <a href="https://github.com/sebastian-software/cuttledoc/actions/workflows/ci.yml"><img src="https://github.com/sebastian-software/cuttledoc/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/cuttledoc"><img src="https://img.shields.io/npm/v/cuttledoc.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/cuttledoc"><img src="https://img.shields.io/npm/dm/cuttledoc.svg" alt="npm downloads"></a>
  <a href="https://codecov.io/gh/sebastian-software/cuttledoc"><img src="https://codecov.io/gh/sebastian-software/cuttledoc/branch/main/graph/badge.svg" alt="code coverage"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
</p>

```bash
npx cuttledoc meeting.m4a --language de --format --output meeting-notes.md
```

The result is a complete transcript with corrected punctuation and readable Markdown structure — not a summary. Use `--no-correct` when you want the raw speech-to-text output instead.

## Why cuttledoc?

- **From recording to document in one workflow.** Read common audio and video formats, extract and resample audio automatically, then write plain text or Markdown.
- **Keep sensitive recordings private.** Parakeet and Whisper run fully offline through CoreML on Apple Silicon.
- **Stay in the Node.js ecosystem.** Use the CLI or a typed API with no Python runtime or sidecar service.
- **Choose speed, language coverage, or convenience.** Switch between local Parakeet, local Whisper, and OpenAI without changing your application flow.
- **Clean up more than punctuation.** Optional LLM post-processing corrects common recognition errors and can add paragraphs, headings, and lists while preserving the original language and content.
- **Make evidence-based tradeoffs.** Reproducible benchmarks compare accuracy and speed, and the CLI can evaluate models against your own recordings.

cuttledoc is a good fit for meeting notes, interviews, podcasts, research recordings, video archives, support calls, and Node.js products that need transcription as a feature.

## Quick start

### Private local transcription on Apple Silicon

Requires Node.js 22+ and macOS on Apple Silicon.

```bash
npm add cuttledoc

# Download the compact, fast local speech model once
npx cuttledoc models download parakeet

# Create a polished Markdown transcript
npx cuttledoc interview.mp4 --language en --format --output interview.md
```

LLM correction is enabled by default. Without Ollama or an OpenAI API key, the embedded correction model downloads automatically on first use. If you only need raw transcription, add `--no-correct` to skip that download and processing step.

### Cloud transcription on macOS, Linux, or Windows

OpenAI needs no local speech model. Audio is uploaded to the OpenAI transcription API.

```bash
npm add cuttledoc
export OPENAI_API_KEY=sk-...

npx cuttledoc call.wav \
  --backend openai \
  --llm-model gpt-5-mini \
  --format \
  --output call.md
```

For raw cloud speech-to-text without LLM post-processing, replace `--llm-model gpt-5-mini --format` with `--no-correct`.

## Choose the right transcription backend

| Backend      | Runs on                | Best for                              | Languages | Local model |
| ------------ | ---------------------- | ------------------------------------- | --------: | ----------- |
| **Parakeet** | macOS on Apple Silicon | Fast, compact, private transcription  |        25 | Required    |
| **Whisper**  | macOS on Apple Silicon | Broad local language coverage         |        99 | Required    |
| **OpenAI**   | macOS, Linux, Windows  | Cloud convenience and strong accuracy |       50+ | None        |

The default `auto` mode chooses Parakeet for its supported languages on macOS and Whisper for other languages. On Linux and Windows, it uses OpenAI when an API key is available. See the [backend guide](https://sebastian-software.github.io/cuttledoc/docs/backends) for model details, privacy considerations, and platform constraints.

## Use it from Node.js

The core API returns raw speech-to-text output so your application controls any post-processing.

```typescript
import { transcribe } from "cuttledoc"

const result = await transcribe("meeting.m4a", {
  backend: "auto", // auto, parakeet, whisper, or openai
  language: "de"
})

console.log(result.text)
console.log(result.durationSeconds)
console.log(result.segments)
```

Use OpenAI from the same API:

```typescript
const result = await transcribe("call.wav", {
  backend: "openai",
  model: "gpt-4o-transcribe",
  apiKey: process.env.OPENAI_API_KEY
})
```

See the [API reference](https://sebastian-software.github.io/cuttledoc/docs/api) for result types, timestamps, backend helpers, and model management.

## Correct or format transcripts with an LLM

Application code can use the separate `@cuttledoc/llm` package with embedded GGUF models, Ollama, or OpenAI.

```bash
npm add @cuttledoc/llm
```

```typescript
import { transcribe } from "cuttledoc"
import { enhanceTranscript } from "@cuttledoc/llm"

const transcript = await transcribe("podcast.mp3")
const enhanced = await enhanceTranscript(transcript.text, {
  provider: "ollama",
  model: "phi4:14b",
  mode: "format" // "correct" keeps the original structure
})

console.log(enhanced.markdown)
```

- **`correct`** fixes punctuation, capitalization, word boundaries, and obvious recognition errors.
- **`format`** also adds Markdown paragraphs, headings, emphasis, and lists.

Both modes are designed to preserve the original language, meaning, wording, and complete content. See the [LLM guide](https://sebastian-software.github.io/cuttledoc/docs/llm) for provider setup, model selection, memory requirements, and long-transcript behavior.

## CLI essentials

```text
cuttledoc <audio-or-video-file> [options]
cuttledoc models [list|download <model>]
cuttledoc benchmark [run|report]
```

| Option                  | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `-b, --backend <name>`  | Select `auto`, `parakeet`, `whisper`, or `openai`      |
| `-m, --model <name>`    | Select an OpenAI speech model                          |
| `-l, --language <code>` | Set a language such as `en`, `de`, or `fr`             |
| `-o, --output <file>`   | Write the transcript to a file                         |
| `-f, --format`          | Correct the transcript and add Markdown structure      |
| `--no-correct`          | Return raw speech-to-text output                       |
| `--llm-model <name>`    | Select the correction model                            |
| `-s, --stats`           | Show timing, backend, word count, and processing speed |
| `-q, --quiet`           | Print only the transcript                              |

The complete command documentation is in the [CLI reference](https://sebastian-software.github.io/cuttledoc/docs/cli).

## Local model management

```bash
cuttledoc models list
cuttledoc models download parakeet      # compact, 25 languages
cuttledoc models download whisper       # broad coverage, 99 languages
cuttledoc models download all           # both speech models
cuttledoc models download gemma3n:e4b   # embedded correction model
```

Ollama manages its own models, for example `ollama pull phi4:14b`. See [Model Management](https://sebastian-software.github.io/cuttledoc/docs/models) for all model IDs and cache locations.

## Supported media

| Audio                               | Video                    |
| ----------------------------------- | ------------------------ |
| WAV, MP3, M4A, AAC, FLAC, OGG, OPUS | MP4, WebM, MKV, MOV, AVI |

Audio is extracted when needed and resampled to 16 kHz mono automatically.

## Benchmarks

The [benchmark documentation](https://sebastian-software.github.io/cuttledoc/docs/benchmarks) publishes accuracy, speed, rankings, fixtures, and methodology for the supported speech and correction models.

You can also compare downloaded speech models against your own paired audio and reference transcripts:

```bash
cuttledoc benchmark run
cuttledoc benchmark run whisper --fixtures ./evaluation
cuttledoc benchmark report
```

## Documentation

- [Getting started](https://sebastian-software.github.io/cuttledoc/)
- [CLI reference](https://sebastian-software.github.io/cuttledoc/docs/cli)
- [Backends and privacy](https://sebastian-software.github.io/cuttledoc/docs/backends)
- [Model management](https://sebastian-software.github.io/cuttledoc/docs/models)
- [LLM enhancement](https://sebastian-software.github.io/cuttledoc/docs/llm)
- [Benchmarks](https://sebastian-software.github.io/cuttledoc/docs/benchmarks)
- [Troubleshooting](https://sebastian-software.github.io/cuttledoc/docs/troubleshooting)
- [API reference](https://sebastian-software.github.io/cuttledoc/docs/api)

## Development

This repository is a pnpm monorepo:

| Package             | Purpose                              |
| ------------------- | ------------------------------------ |
| `cuttledoc`         | Core transcription library and CLI   |
| `@cuttledoc/llm`    | Transcript correction and formatting |
| `@cuttledoc/ffmpeg` | Audio extraction and conversion      |
| `@cuttledoc/docs`   | Documentation website                |

```bash
git clone https://github.com/sebastian-software/cuttledoc.git
cd cuttledoc
pnpm install
pnpm build
pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [SECURITY.md](SECURITY.md) for responsible disclosure.

## License

MIT © [Sebastian Software GmbH](https://sebastian-software.de)

## Acknowledgments

- [parakeet-coreml](https://github.com/sebastian-software/parakeet-node) — NVIDIA Parakeet TDT for CoreML
- [whisper-coreml](https://github.com/sebastian-software/whisper-node) — OpenAI Whisper for CoreML
