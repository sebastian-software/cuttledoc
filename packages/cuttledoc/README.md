# cuttledoc

Local-first speech transcription for Apple Silicon. This package is the thin
Node.js surface over Cuttledoc's Rust core. Apple Speech is the default local
backend on macOS 26 or newer; Whisper `large-v3-turbo` is the opt-in local
quality and language-detection fallback.

```js
import { transcribeFile } from 'cuttledoc';

const result = await transcribeFile('/path/to/podcast.m4a', {
  language: 'en-US',
  backend: 'auto',
});

console.log(result.text);
```

File input uses an explicitly configured FFmpeg executable, `FFMPEG_PATH`, or
`ffmpeg` on `PATH`. `transcribePcm` remains available for mono little-endian
`f32` PCM. Select `backend: 'whisper'` with a paired GGML/Core ML model through
`modelPath` when the managed cache is not populated. Pass an `AbortSignal` as
`signal` to cancel decoding or recognition. The package contains a prebuilt
macOS arm64 Node-API artifact and does not compile code during installation.

This is an implementation-incubator artifact and is not yet the production
Cuttledoc v3 release. See the
[repository](https://github.com/sebastian-software/cuttledoc-rs) for status and
the native CLI.
