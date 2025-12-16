# Architecture Decision Records

This document captures key architectural decisions for `local-transcribe`.

---

## ADR-001: Multi-Backend Architecture

**Status:** Accepted  
**Date:** 2024-12-16

### Context

Local speech-to-text has multiple viable approaches, each with trade-offs:

| Approach | Pros | Cons |
|----------|------|------|
| Apple Speech | Native, fast, no download | macOS only |
| Whisper (OpenAI) | High quality, 99 languages | Large models, slower |
| Parakeet (NVIDIA) | Fastest for EU languages | 25 languages only |
| Cloud APIs | Best quality | Requires internet, costs money |

### Decision

Implement a **unified API with pluggable backends**:

```typescript
const result = await transcribe("audio.wav", { 
  language: "de",
  backend: "auto" // or "apple", "sherpa"
});
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

| Option | Runtime Size | Node.js Bindings | Models Supported |
|--------|--------------|------------------|------------------|
| `onnxruntime-node` | ~100MB | ✅ Official | Any ONNX |
| `sherpa-onnx` | ~40MB | ✅ Official | Speech-optimized |
| `whisper.cpp` | ~2MB | 🔨 Build yourself | Whisper only |
| MLX (Apple) | ~50MB | ❌ Python only | Apple Silicon only |

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

| Model | Size | Speed | Quality | Languages |
|-------|------|-------|---------|-----------|
| Whisper large-v3 | 3GB | Slow | Best | 99 |
| Whisper small | 466MB | Medium | Good | 99 |
| Parakeet v3 FP32 | 600MB | Fast | Excellent | 25 EU |
| Parakeet v3 INT8 | ~150MB | Fastest | Excellent | 25 EU |

### Decision

Use **Parakeet v3 INT8** as default for EU languages:

```typescript
// Auto-selection logic
if (isEuropeanLanguage(lang) && !userPreferredModel) {
  return "parakeet-tdt-0.6b-v3-int8";
}
return "whisper-small"; // fallback
```

### Consequences

- ✅ Best speed/quality ratio for EU languages
- ✅ Smaller download than Whisper large
- ⚠️ ~1.2GB RAM usage at runtime
- ⚠️ Non-EU languages fall back to Whisper

---

## ADR-004: Native Addon for Apple Speech

**Status:** Accepted  
**Date:** 2024-12-16

### Context

Apple Speech Framework requires native macOS code. Options:

| Approach | Complexity | Performance | Maintenance |
|----------|------------|-------------|-------------|
| N-API + Objective-C++ | High | Best | Medium |
| Swift executable + IPC | Medium | Good | Low |
| AppleScript/osascript | Low | Poor | Low |

### Decision

Use **N-API with Objective-C++** for direct integration:

```cpp
// speech.mm
[recognizer recognitionTaskWithRequest:request
    resultHandler:^(SFSpeechRecognitionResult* result, NSError* error) {
        // Direct callback to Node.js
    }];
```

Reasons:
1. No subprocess overhead
2. Direct memory sharing
3. Proper async handling with N-API AsyncWorker
4. Type-safe interface via TypeScript

### Consequences

- ✅ Best performance, no IPC overhead
- ✅ Proper error propagation
- ⚠️ Requires Xcode Command Line Tools to build
- ⚠️ More complex build setup (binding.gyp)

---

## ADR-005: ESM-Only Package

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
- ⚠️ Requires Node.js 18+ (we target 24+)

---

## ADR-006: Lazy Backend Loading

**Status:** Accepted  
**Date:** 2024-12-16

### Context

Loading all backends at startup wastes resources if user only needs one.

### Decision

**Lazy-load backends** on first use:

```typescript
export async function transcribe(audioPath: string, options: TranscribeOptions) {
  const backend = options.backend ?? selectBestBackend();
  
  switch (backend) {
    case "apple": {
      // Only import when needed
      const { AppleBackend } = await import("./backends/apple/index.js");
      return new AppleBackend().transcribe(audioPath, options);
    }
    case "sherpa": {
      const { SherpaBackend } = await import("./backends/sherpa/index.js");
      // ...
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

## Future Considerations

### Potential ADRs

- **ADR-007**: Streaming transcription API design
- **ADR-008**: Model caching and download strategy
- **ADR-009**: Worker thread isolation for heavy processing
- **ADR-010**: Browser/WebAssembly support

---

*Last updated: 2024-12-16*

