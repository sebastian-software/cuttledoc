# cuttledoc

Local-first speech transcription for Apple Silicon. This package is the thin
Node.js surface over Cuttledoc's Rust core and currently uses the Apple Speech
framework on macOS 26 or newer.

```js
import { transcribeFile } from 'cuttledoc';

const result = await transcribeFile('/path/to/podcast.m4a', {
  language: 'en-US',
});

console.log(result.text);
```

File input uses an explicitly configured FFmpeg executable, `FFMPEG_PATH`, or
`ffmpeg` on `PATH`. `transcribePcm` remains available for mono little-endian
`f32` PCM. Pass an `AbortSignal` as `signal` to cancel decoding or recognition.
The package contains a prebuilt macOS arm64 Node-API artifact and does not
compile code during installation.

This is an implementation-incubator artifact and is not yet the production
Cuttledoc v3 release. See the
[repository](https://github.com/sebastian-software/cuttledoc-rs) for status and
the native CLI.
