# cuttledoc

Local-first speech transcription for Apple Silicon. This package is the thin
Node.js surface over Cuttledoc's Rust core and currently uses the Apple Speech
framework on macOS 26 or newer.

```js
import { readFile } from 'node:fs/promises';
import { transcribePcm } from 'cuttledoc';

const pcm = await readFile('/tmp/input.f32le');
const result = await transcribePcm(pcm, {
  language: 'en-US',
  sampleRate: 16_000,
});

console.log(result.text);
```

The current input contract is mono little-endian `f32` PCM. Pass an
`AbortSignal` as `signal` to cancel active work. The package contains a
prebuilt macOS arm64 Node-API artifact and does not compile code during
installation.

This is an implementation-incubator artifact and is not yet the production
Cuttledoc v3 release. See the
[repository](https://github.com/sebastian-software/cuttledoc-rs) for status and
the native CLI.
