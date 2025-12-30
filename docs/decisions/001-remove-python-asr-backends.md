# ADR-001: Removal of Python-based ASR Backends (Phi-4, Canary)

**Date:** 2024-12-31
**Status:** Accepted
**Authors:** Sebastian Werner
**Archive Branch:** [`archive/python-asr-backends-2024-12`](https://github.com/sebastian-software/cuttledoc/tree/archive/python-asr-backends-2024-12)

## Context

Between December 2024, we implemented two Python-based ASR backends:

1. **Microsoft Phi-4-multimodal** - A 14B parameter multimodal model with audio transcription capabilities
2. **NVIDIA Canary-1B-v2** - A 1B parameter multilingual ASR model supporting 26 European languages

These backends required a separate Python HTTP server (`server.py`) that was spawned and managed by the Node.js process, communicating via localhost HTTP.

## Decision

We decided to **remove both Python-based backends** and simplify the architecture to use only:

- **Parakeet v3** (via sherpa-onnx-node) - Fast local transcription
- **Whisper large-v3** (via sherpa-onnx-node) - High-quality local transcription
- **OpenAI gpt-4o-transcribe** (via REST API) - Cloud-based premium option

## Benchmark Results at Decision Time

Measured on Apple M1 Pro, December 31, 2024, using [FLEURS dataset](https://huggingface.co/datasets/google/fleurs) native speaker recordings (10 samples × 5 languages):

### Word Error Rate (WER) - Lower is Better

| Backend           | 🇬🇧 EN | 🇪🇸 ES | 🇩🇪 DE | 🇫🇷 FR | 🇧🇷 PT | **Avg WER** |
| ----------------- | ----- | ----- | ----- | ----- | ----- | ----------- |
| gpt-4o-transcribe | 9.9%  | 2.1%  | 2.8%  | 6.3%  | 4.6%  | **5.1%**    |
| Whisper large-v3  | 4.9%  | 2.1%  | 2.8%  | 10.6% | 5.2%  | **5.1%**    |
| Canary-1B-v2      | 8.2%  | 3.2%  | 2.8%  | 7.9%  | 5.7%  | **5.6%**    |
| Phi-4-multimodal  | 3.3%  | 2.5%  | 3.7%  | 10.2% | 10.7% | **6.1%**    |
| Parakeet v3       | 4.6%  | 3.6%  | 4.5%  | 10.1% | 9.0%  | **6.4%**    |

### Real-Time Factor (RTF) - Lower is Faster

| Backend           | RTF  | Notes                            |
| ----------------- | ---- | -------------------------------- |
| gpt-4o-transcribe | 0.16 | Cloud, network latency included  |
| Parakeet v3       | 0.24 | CPU-only, no GPU required        |
| Phi-4-multimodal  | 0.56 | Requires MPS/CUDA GPU            |
| Canary-1B-v2      | 0.57 | Requires CUDA, CPU fallback slow |
| Whisper large-v3  | 2.2  | CPU-only benchmark               |

## Challenges Encountered

### 1. Python Environment Management

```
Problem: Managing Python virtual environments from Node.js
├── Finding correct Python executable (python3, python, venv)
├── Installing dependencies (pip install in subprocess)
├── Handling different Python versions (3.8+ required)
└── Platform differences (macOS, Linux, Windows)
```

The `findPython()` function had to search multiple paths and verify Python availability:

```typescript
async function findPython(): Promise<string> {
  const venvPython = join(PACKAGE_ROOT, "..", "..", "experiments", "phi4-prototype", "venv", "bin", "python")
  const pythonPaths = [venvPython, "python3", "python"]

  for (const p of pythonPaths) {
    try {
      const proc = spawn(p, ["--version"], { stdio: "pipe" })
      await new Promise<void>((resolve, reject) => {
        proc.on("close", (code) => {
          code === 0 ? resolve() : reject()
        })
      })
      return p
    } catch {
      continue
    }
  }
  throw new Error("Python not found")
}
```

### 2. Dependency Hell

**Phi-4 required:**

```
transformers>=4.47.0  # But not newer due to breaking changes
peft==0.13.0          # Specific version, newer broke LoRA loading
torch>=2.0            # With MPS support for Apple Silicon
torchvision           # For multimodal processing
einops                # Tensor operations
backoff               # Retry logic
flash-attn            # Optional, for faster attention
```

**Canary required:**

```
nemo_toolkit[asr] @ git+https://github.com/NVIDIA/NeMo.git
# This pulls in:
# - pytorch-lightning
# - hydra-core
# - omegaconf
# - librosa
# - soundfile
# - And ~50 more transitive dependencies
```

We encountered version conflicts between `transformers` and `peft`:

```
AttributeError: 'LoraModel' object has no attribute 'prepare_inputs_for_generation'
# Fixed by pinning: peft==0.13.0, transformers==4.47.0
```

### 3. Server Lifecycle Management

The Python server needed careful lifecycle management:

```typescript
// Start server with timeout
serverProcess = spawn(pythonPath, [SERVER_SCRIPT, "--port", String(port), "--backend", backend, "--preload"], {
  stdio: ["ignore", "inherit", "inherit"]
})

// Health check with retry
async function waitForServer(port: number, timeoutMs: number): Promise<void> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) return
    } catch {
      /* retry */
    }
    await sleep(500)
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`)
}
```

Issues encountered:

- Port conflicts when multiple instances started
- Zombie processes after crashes
- Model loading time (Phi-4: ~30s, Canary: ~10s)
- Memory not freed after dispose()

### 4. GPU Requirements

**Phi-4-multimodal:**

- Minimum 12GB VRAM (or MPS unified memory)
- FP16 inference required
- CUDA 11.8+ or MPS (Apple Silicon)

**Canary-1B-v2:**

- Optimized for NVIDIA GPUs
- CPU fallback extremely slow (~10x RTF)
- No native MPS support

Most users don't have suitable GPUs, making these backends impractical for general use.

### 5. Inconsistent Quality

Phi-4 showed high variance across languages:

| Language   | WER   | Assessment             |
| ---------- | ----- | ---------------------- |
| English    | 3.3%  | 🏆 Best of all models  |
| Spanish    | 2.5%  | ✅ Excellent           |
| German     | 3.7%  | ✅ Good                |
| French     | 10.2% | ⚠️ Poor                |
| Portuguese | 10.7% | ❌ Worst of all models |

This inconsistency made it hard to recommend as a general-purpose solution.

## What We Learned

### 1. ONNX vs Native PyTorch

sherpa-onnx-node with pre-converted ONNX models provides:

- ✅ Single binary, no Python required
- ✅ Consistent performance across platforms
- ✅ Smaller memory footprint
- ✅ Faster cold start (no model loading from Python)

Native PyTorch requires:

- ❌ Full Python environment
- ❌ GPU drivers and CUDA toolkit
- ❌ Complex dependency management
- ❌ Platform-specific optimizations

### 2. The 80/20 Rule

For 80% of use cases:

- **Parakeet** (6.4% WER, 0.24 RTF) is "good enough" and fast
- **Whisper** (5.1% WER, 2.2 RTF) covers quality-critical cases
- **OpenAI** (5.1% WER, 0.16 RTF) handles cloud/API scenarios

The remaining 20% (specific language optimization, edge cases) didn't justify the complexity.

### 3. User Experience Matters

Installation complexity comparison:

```bash
# Without Python backends (after removal)
npm install cuttledoc
cuttledoc models download parakeet
cuttledoc audio.mp3  # Works immediately

# With Python backends (before removal)
npm install cuttledoc
pip install torch transformers peft  # Hope versions are compatible
pip install "nemo_toolkit[asr] @ git+https://github.com/NVIDIA/NeMo.git"
# Wait 10-30 minutes for model downloads
# Debug CUDA/MPS issues
# Maybe it works?
```

## Alternatives Considered

### 1. ONNX Conversion of Phi-4/Canary

**Phi-4:**

- Multimodal architecture (audio + vision + text) is complex to export
- LoRA adapters need runtime merging
- Dynamic control flow not ONNX-compatible
- Estimated effort: Several weeks

**Canary:**

- NeMo has built-in ONNX export, but...
- sherpa-onnx doesn't support the resulting format
- Would require sherpa-onnx upstream changes

### 2. WebAssembly/Transformers.js

- Maximum model size ~2GB (Phi-4 is 12GB)
- No GPU acceleration in Node.js context
- Performance 2-3x slower than ONNX Runtime

### 3. Keeping as Optional/Experimental

We decided against this because:

- Code still needs maintenance
- Users would hit confusing errors
- Documentation burden

## Consequences

### Positive

1. **Simpler architecture**: Single runtime (Node.js), no IPC
2. **Easier installation**: `npm install` just works
3. **Reduced maintenance**: No Python version/dependency tracking
4. **Better reliability**: No server lifecycle management
5. **Smaller package**: No Python scripts bundled

### Negative

1. **Lost Phi-4's excellent English WER** (3.3%, best local result)
2. **Lost Canary's German optimization** (tied with Whisper at 2.8%)
3. **No path to future multimodal features** (Phi-4 supports images too)

### Neutral

1. **Average WER unchanged**: Whisper matches or beats both removed backends
2. **Speed improved**: Parakeet is faster than both removed backends

## Future Considerations

### When to Reconsider

1. **Official ONNX releases**: If Microsoft/NVIDIA publish optimized ONNX versions
2. **sherpa-onnx updates**: If upstream adds Phi-4/Canary architecture support
3. **Transformers.js improvements**: If it can handle larger models efficiently
4. **User demand**: If specific languages need better support

### Preserved for Reference

- **Archive branch**: `archive/python-asr-backends-2024-12`
- **Server implementation**: `packages/cuttledoc/src/backends/python-asr/server.py`
- **Client implementation**: `packages/cuttledoc/src/backends/python-asr/index.ts`
- **Benchmark data**: `packages/cuttledoc/fixtures/benchmark.py`

## Files Removed

```
packages/cuttledoc/src/backends/python-asr/
├── index.ts      # TypeScript client (~330 lines)
└── server.py     # Python HTTP server (~200 lines)
```

## Related Links

- [Phi-4-multimodal on Hugging Face](https://huggingface.co/microsoft/Phi-4-multimodal-instruct)
- [Canary-1B-v2 on NVIDIA NGC](https://catalog.ngc.nvidia.com/orgs/nvidia/teams/nemo/models/canary-1b)
- [FLEURS Dataset](https://huggingface.co/datasets/google/fleurs)
- [sherpa-onnx Documentation](https://k2-fsa.github.io/sherpa/onnx/)
