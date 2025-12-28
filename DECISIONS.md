# Architecture Decision Records

This document captures key architectural decisions for `cuttledoc`.

---

## ADR-001: Multi-Backend Architecture

**Status:** Accepted
**Date:** 2024-12-16

### Context

Local speech-to-text has multiple viable approaches, each with trade-offs:

| Approach          | Pros                       | Cons                           |
| ----------------- | -------------------------- | ------------------------------ |
| Whisper (OpenAI)  | High quality, 99 languages | Large models, slower           |
| Parakeet (NVIDIA) | Fastest for EU languages   | 25 languages only              |
| Cloud APIs        | Best quality               | Requires internet, costs money |

### Decision

Implement a **unified API with pluggable backends**:

```typescript
const result = await transcribe("audio.wav", {
  language: "de",
  backend: "auto" // or "parakeet", "whisper"
})
```

Backend selection:

1. **Auto mode**: Select best available backend for platform/language
2. **Explicit mode**: User specifies preferred backend

### Consequences

- ✅ Users get optimal performance without configuration
- ✅ Cross-platform support with single API
- ⚠️ More complex codebase with multiple backends
- ⚠️ Testing matrix grows with each backend

---

## ADR-002: sherpa-onnx over Raw ONNX Runtime

**Status:** Accepted
**Date:** 2024-12-16

### Context

For cross-platform speech recognition, we evaluated:

| Option             | Runtime Size | Node.js Bindings  | Models Supported   |
| ------------------ | ------------ | ----------------- | ------------------ |
| `onnxruntime-node` | ~100MB       | ✅ Official       | Any ONNX           |
| `sherpa-onnx`      | ~40MB        | ✅ Official       | Speech-optimized   |
| `whisper.cpp`      | ~2MB         | 🔨 Build yourself | Whisper only       |
| MLX (Apple)        | ~50MB        | ❌ Python only    | Apple Silicon only |

### Decision

Use **sherpa-onnx** as the primary cross-platform backend.

Reasons:

1. **Official Node.js bindings** - `npm install sherpa-onnx`
2. **Smaller runtime** - ~40MB vs ~100MB for full ONNX Runtime
3. **Multi-model support** - Whisper, Parakeet v3, Paraformer in one runtime
4. **Speech-optimized** - Built by k2-fsa team (Kaldi successor)
5. **Streaming support** - Real-time transcription possible
6. **Active development** - Regular updates, good community

### Consequences

- ✅ One backend covers Whisper + Parakeet + more
- ✅ Smaller dependency footprint than raw ONNX Runtime
- ✅ Streaming transcription possible in future
- ⚠️ Dependent on k2-fsa team's maintenance
- ⚠️ Not as widely known as whisper.cpp

---

## ADR-003: Parakeet v3 INT8 as Default for EU Languages

**Status:** Accepted
**Date:** 2024-12-16

### Context

For European languages (de, en, fr, es, it, etc.), multiple models are viable:

| Model            | Size   | Speed   | Quality   | Languages |
| ---------------- | ------ | ------- | --------- | --------- |
| Whisper large-v3 | 3GB    | Slow    | Best      | 99        |
| Whisper small    | 466MB  | Medium  | Good      | 99        |
| Parakeet v3 FP32 | 600MB  | Fast    | Excellent | 25 EU     |
| Parakeet v3 INT8 | ~150MB | Fastest | Excellent | 25 EU     |

### Decision

Use **Parakeet v3 INT8** as default for EU languages:

```typescript
// Auto-selection logic
if (isEuropeanLanguage(lang) && !userPreferredModel) {
  return "parakeet-tdt-0.6b-v3-int8"
}
return "whisper-small" // fallback
```

### Consequences

- ✅ Best speed/quality ratio for EU languages
- ✅ Smaller download than Whisper large
- ⚠️ ~1.2GB RAM usage at runtime
- ⚠️ Non-EU languages fall back to Whisper

---

## ADR-004: ESM-Only Package

**Status:** Accepted
**Date:** 2024-12-16

### Context

Node.js supports both CommonJS and ESM. Modern packages trend toward ESM-only.

### Decision

Ship as **ESM-only** (`"type": "module"`):

```json
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```

Reasons:

1. Node.js 24+ has mature ESM support
2. Better tree-shaking
3. Simpler build (no dual CJS/ESM)
4. Top-level await support

### Consequences

- ✅ Cleaner codebase
- ✅ Better bundler compatibility
- ⚠️ CJS users must use dynamic import
- ⚠️ Requires Node.js 22+ (we test 22 and 24, but recommend 24+)

---

## ADR-005: Lazy Backend Loading

**Status:** Accepted
**Date:** 2024-12-16

### Context

Loading all backends at startup wastes resources if user only needs one.

### Decision

**Lazy-load backends** on first use:

```typescript
export async function transcribe(audioPath: string, options: TranscribeOptions) {
  const backend = options.backend ?? selectBestBackend()

  switch (backend) {
    case "parakeet":
    case "whisper": {
      // Only import when needed
      const { SherpaBackend } = await import("./backends/sherpa/index.js")
      const model = backend === "parakeet" ? "parakeet-tdt-0.6b-v3" : "whisper-medium"
      return new SherpaBackend({ model }).transcribe(audioPath, options)
    }
  }
}
```

### Consequences

- ✅ Faster startup time
- ✅ Smaller memory footprint when using single backend
- ⚠️ First transcription has import overhead
- ⚠️ Slightly more complex code

---

## ADR-006: Native FFmpeg Bindings for Audio Preprocessing

**Status:** Accepted
**Date:** 2024-12-16

### Context

Speech recognition models typically require 16kHz mono WAV input. Users have audio in various formats (mp3, m4a, flac, etc.).

| Option               | Approach           | Streaming          | Binary Size    |
| -------------------- | ------------------ | ------------------ | -------------- |
| `ffmpeg` CLI         | Subprocess         | No (wait for file) | External dep   |
| `fluent-ffmpeg`      | Subprocess wrapper | Partial            | External dep   |
| `@mmomtchev/ffmpeg`  | Native bindings    | Yes (streams)      | ~50MB bundled  |
| `@ffprobe-installer` | Download binary    | No                 | ~30MB download |

### Decision

Use **@mmomtchev/ffmpeg** native bindings:

```typescript
import { Demuxer, AudioDecoder, AudioTransform } from "@mmomtchev/ffmpeg/stream"

async function* streamAudioSamples(path: string) {
  const demuxer = new Demuxer({ inputFile: path })
  const decoder = new AudioDecoder({ stream: demuxer.audio[0] })
  const resampler = new AudioTransform({
    input: decoder.definition(),
    output: { sampleRate: 16000, channels: 1, format: "flt" }
  })

  decoder.pipe(resampler)

  for await (const frame of resampler) {
    yield frame.data as Float32Array
  }
}
```

Reasons:

1. **True streaming** - Transcription can start before file is fully decoded
2. **No external dependency** - FFmpeg bundled as native addon
3. **Async, multi-threaded** - Leverages Node.js worker pool
4. **Format coverage** - All FFmpeg codecs (mp3, aac, flac, opus, etc.)

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Input: podcast.mp3                                      │
│           │                                              │
│           ▼                                              │
│  ┌─────────────────┐                                    │
│  │ Demuxer         │  ← Native ffmpeg, async            │
│  └────────┬────────┘                                    │
│           │ Readable stream                              │
│           ▼                                              │
│  ┌─────────────────┐                                    │
│  │ AudioDecoder    │  ← Compressed → Raw samples        │
│  └────────┬────────┘                                    │
│           │                                              │
│           ▼                                              │
│  ┌─────────────────┐                                    │
│  │ AudioTransform  │  ← Resample to 16kHz mono float32  │
│  └────────┬────────┘                                    │
│           │ AsyncGenerator<Float32Array>                 │
│           ▼                                              │
│  ┌─────────────────┐                                    │
│  │ sherpa-onnx     │  ← acceptWaveform() with chunks    │
│  └─────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

### Consequences

- ✅ Streaming pipeline - no waiting for full decode
- ✅ Self-contained - no ffmpeg install required
- ✅ Consistent behavior across platforms
- ⚠️ ~50MB added to package size
- ⚠️ ESLint strict rules require some `any` type annotations

---

## ADR-007: TurboRepo for Monorepo Build Pipeline

**Status:** Accepted
**Date:** 2025-12-17

### Context

The project uses a pnpm monorepo with multiple packages (`cuttledoc`, `@cuttledoc/docs`). We need efficient build orchestration, caching, and parallel execution.

### Decision

Use **TurboRepo** for build pipeline management:

```json
{
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint"
  }
}
```

Reasons:

1. **Intelligent caching** - Skips unchanged packages
2. **Parallel execution** - Runs independent tasks concurrently
3. **Dependency awareness** - Respects package dependencies
4. **Remote caching** - Can share cache across CI runs
5. **Task pipelines** - Defines task dependencies clearly

### Consequences

- ✅ Faster builds through caching and parallelization
- ✅ Better developer experience with incremental builds
- ✅ Consistent build behavior across environments
- ⚠️ Additional dependency (turbo)
- ⚠️ Requires turbo.json configuration

---

## ADR-008: Cross-Platform CI Matrix Testing

**Status:** Accepted
**Date:** 2025-12-17

### Context

The project supports multiple platforms (macOS, Windows, Linux) and we need to ensure compatibility across all.

### Decision

Use **GitHub Actions matrix strategy** to test on all platforms:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node-version: [22, 24]
```

Test matrix covers:

- **Platforms**: Ubuntu, Windows, macOS
- **Node.js versions**: 22, 24
- **Jobs**: typecheck, test, build

### Consequences

- ✅ Ensures cross-platform compatibility
- ✅ Catches platform-specific issues early
- ⚠️ Longer CI runtime (6 combinations per job)

---

## Rejected / Superseded Decisions

### ADR-R01: Apple Speech Framework Backend (Rejected)

**Status:** Rejected
**Date:** 2024-12-16 (proposed) → 2024-12-28 (rejected)

#### Context

We initially planned to integrate Apple's native Speech Framework (`SFSpeechRecognizer`) as a backend for macOS users. The appeal was:

- **No model download** - Uses pre-installed system models
- **Neural Engine acceleration** - Optimized for Apple Silicon
- **60+ languages** - Broad language support out of the box

#### Investigation Results

During prototyping, we discovered several significant issues:

1. **Online/Offline Behavior Inconsistency**
   - For short audio (<1 min), Apple uses on-device recognition
   - For longer content, it silently switches to Apple's cloud servers
   - No reliable way to force offline-only processing
   - This violates our "offline-first" principle

2. **Complex Native Integration**
   - Requires N-API bindings with Objective-C++ (`speech.mm`)
   - Needs `node-gyp` build step with Xcode Command Line Tools
   - Platform-specific `binding.gyp` configuration
   - Adds maintenance burden for macOS-only code

3. **No Performance Advantage**
   - Benchmarks showed Parakeet v3 matches or exceeds Apple Speech speed
   - Whisper provides better accuracy for difficult audio
   - Apple Speech quality comparable but not superior

4. **Permission Complexity**
   - Requires user to grant microphone/speech recognition permissions
   - Permission prompts interrupt automated workflows
   - No programmatic way to check permission status reliably

#### Decision

**Reject** Apple Speech Framework integration in favor of cross-platform sherpa-onnx backends (Parakeet, Whisper).

#### Consequences

- ✅ Simpler codebase - no native Objective-C++ code
- ✅ Consistent behavior across all platforms
- ✅ Guaranteed offline operation
- ✅ No macOS-specific build requirements
- ⚠️ macOS users must download models (~150MB for Parakeet)
- ⚠️ No Neural Engine acceleration (CPU/GPU via ONNX instead)

#### Lessons Learned

- "Native" doesn't always mean "better" - cross-platform solutions can match or exceed native performance
- Online fallback behavior in system APIs is a hidden complexity
- The overhead of maintaining platform-specific native code rarely justifies marginal benefits

---

## Future Considerations

### Potential ADRs

- **ADR-009**: Model caching and download strategy
- **ADR-010**: Worker thread isolation for heavy processing
- **ADR-011**: Browser/WebAssembly support
- **ADR-012**: Streaming transcription API design
