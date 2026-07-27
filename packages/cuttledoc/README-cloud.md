# cuttledoc

This platform-specific Cuttledoc package contains the cloud-only Node.js
runtime for explicit OpenAI transcription. It includes a prebuilt Node-API
binary and does not compile code during installation.

```js
import { transcribeFile } from 'cuttledoc';

const result = await transcribeFile('/path/to/podcast.m4a', {
  language: 'en-US',
  backend: 'openai-transcription',
  model: 'gpt-4o-transcribe',
  credential: process.env.OPENAI_API_KEY,
  timeoutMs: 300_000,
});

console.log(result.text);
```

Omit `credential` to let the native core read `OPENAI_API_KEY`. The credential
is ephemeral and is never returned, logged, or persisted by the native
boundary. `auto` remains local-only and therefore reports no available
recognition backend in this cloud-only build; network use always requires
`backend: 'openai-transcription'`.

The package uploads the original supported media file without FFmpeg. Initial
models are `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, and
timestamp-capable `whisper-1`. Provider uploads are bounded to 25 MB.

Apple Speech, Whisper.cpp, Gemma/MLX, model weights, FFmpeg, and native build
inputs are not present in this artifact.
