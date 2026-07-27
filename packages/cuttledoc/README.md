# cuttledoc

Local-first speech transcription with an explicit hosted escape hatch. This
package is the thin Node.js surface over Cuttledoc's Rust core. Apple Speech is
the default local backend on macOS 26 or newer; Whisper `large-v3-turbo` is the
opt-in local quality and language-detection fallback.

```js
import { transcribeFile } from 'cuttledoc';

const result = await transcribeFile('/path/to/podcast.m4a', {
  language: 'en-US',
  backend: 'auto',
  enhancement: 'local',
});

console.log(result.text);
console.log(result.rawText);
```

File input uses an explicitly configured FFmpeg executable, `FFMPEG_PATH`, or
`ffmpeg` on `PATH`. `transcribePcm` remains available for mono little-endian
`f32` PCM. Select `backend: 'whisper'` with a paired GGML/Core ML model through
`modelPath` when the managed cache is not populated. Pass an `AbortSignal` as
`signal` to cancel decoding or recognition. The package contains a prebuilt
macOS arm64 Node-API artifact and does not compile code during installation.

OpenAI transcription is file-only and must be selected explicitly. It uploads
the original supported media file, never changes `auto`, and does not invoke
FFmpeg:

```js
const result = await transcribeFile('/path/to/podcast.m4a', {
  language: 'en-US',
  backend: 'openai-transcription',
  model: 'gpt-4o-transcribe',
  credential: process.env.OPENAI_API_KEY,
  timeoutMs: 300_000,
});
```

Omit `credential` to let the native core read `OPENAI_API_KEY`. The credential
is ephemeral and is never returned, logged, or persisted by the native
boundary. Supported initial models are `gpt-4o-transcribe`,
`gpt-4o-mini-transcribe`, and timestamp-capable `whisper-1`; files are bounded
to 25 MB by the provider contract.

Transcript enhancement is provider-neutral in JavaScript:

- `enhancement: 'off'` is the temporary default until the direct 32 GB
  Apple-Silicon gate in ADR-0014 is complete.
- `enhancement: 'local'` uses the pinned Gemma 4 26B-A4B 4-bit adapter over
  official MLX when the memory and model gates pass. Use
  `enhancementModelPath` only to override the managed/environment model path.
- `enhancement: 'gemini'` explicitly selects Gemini 3.6 Flash through the
  pinned OpenRouter/Google Vertex route. It reads `OPENROUTER_API_KEY`; a
  configured key alone never enables hosted processing.

`rawText` always retains the successful ASR output. `text` contains the
accepted enhancement or the same raw text when runtime acquisition,
structured-output validation, or the conservative correction policy falls
back. `textGenerationBackends()` reports the current local and hosted
capability gates. Recognition resources are released before either
enhancement runtime is acquired.

This is an implementation-incubator artifact and is not yet the production
Cuttledoc v3 release. See the
[repository](https://github.com/sebastian-software/cuttledoc-rs) for status and
the native CLI.
