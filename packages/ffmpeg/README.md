# @cuttledoc/ffmpeg

Lightweight FFmpeg utilities for decoding audio into speech-ready PCM samples.

## Features

- Decodes any audio format supported by FFmpeg
- Returns interleaved `Float32Array` PCM samples
- Defaults to 16 kHz mono audio for speech recognition
- Applies speech-oriented band-pass filtering and EBU R128 normalization
- Downloads a pinned, checksum-verified FFmpeg 8 binary during installation
- Supports macOS, Linux, and Windows on x64 and arm64

## Installation

```bash
pnpm add @cuttledoc/ffmpeg
```

The package downloads the matching FFmpeg binary during installation. Set
`SKIP_FFMPEG=true` to skip that download, or set `FFMPEG_PATH` to use an
existing FFmpeg executable.

## Usage

```typescript
import { decodeAudio, ffmpegPath, ffmpegVersion } from "@cuttledoc/ffmpeg"

const audio = await decodeAudio("recording.m4a")

console.log({
  samples: audio.samples.length,
  sampleRate: audio.sampleRate,
  channels: audio.channels,
  durationSeconds: audio.durationSeconds,
  ffmpegPath: ffmpegPath(),
  ffmpegVersion: ffmpegVersion()
})
```

Disable the default speech preprocessing when raw conversion is needed:

```typescript
const audio = await decodeAudio("music.flac", {
  sampleRate: 48_000,
  channels: 2,
  speechOptimize: false
})
```

## License

MIT
