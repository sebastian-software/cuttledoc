# Phi-4-multimodal ASR Prototype

Experimental prototype to evaluate Microsoft's Phi-4-multimodal for speech recognition on Apple Silicon.

## Status: ✅ Works on Apple Silicon (MPS)

Successfully running on Apple Silicon with Metal Performance Shaders (MPS).

## Results

### Performance (German fairy tale, 103s audio)

| Metric         | Value                            |
| -------------- | -------------------------------- |
| **Device**     | mps (Metal)                      |
| **RTF**        | 0.73x (27% faster than realtime) |
| **Inference**  | 75.2s                            |
| **Model Load** | 24.6s                            |
| **WER**        | 14.16%                           |
| **RAM**        | ~12 GB                           |

### Quality Comparison

| Model                | WER       | RTF       | Notes              |
| -------------------- | --------- | --------- | ------------------ |
| whisper-tiny         | 13.6%     | ~0.13x    | Baseline           |
| whisper-base         | 8.1%      | ~0.25x    |                    |
| whisper-small        | 5.5%      | ~0.57x    |                    |
| parakeet-v3          | 5.5%      | ~0.17x    | Best speed/quality |
| **Phi-4-multimodal** | **14.2%** | **0.73x** | 6B params, MPS     |

### Key Findings

1. **Phi-4 runs on Apple Silicon** with MPS - no NVIDIA GPU required
2. **Quality is comparable to whisper-tiny** (not large-v3 as hoped)
3. **Speed is slower** than specialized ASR models
4. **RAM usage is high** (~12 GB) due to 6B parameter model

### Technical Workarounds Required

- `transformers==4.48.2` (specific version required)
- `peft==0.13.2` (specific version required)
- `attn_implementation="eager"` (FlashAttention2 disabled)
- Chat template for proper prompt formatting

## Setup

```bash
cd experiments/phi4-prototype

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Usage

```bash
# Use patched version for Apple Silicon
python transcribe_patched.py audio.ogg --device mps

# With WER calculation
python transcribe_patched.py audio.ogg --device mps --reference reference.txt
```

## Conclusion

Phi-4-multimodal is **not practical for cuttledoc** at this time:

- ❌ Slower than dedicated ASR models
- ❌ Similar quality to whisper-tiny (not large-v3)
- ❌ High RAM usage (12 GB)
- ❌ Complex setup (specific versions, workarounds)
- ❌ No Node.js bindings

**Recommendation**: Stay with current two-model strategy:

- `parakeet-tdt-0.6b-v3` (25 languages, fast, small)
- `whisper-distil-large-v3` (99 languages, best quality)

## Next Steps (if pursuing Phi-4)

1. Wait for Microsoft to add CPU support
2. Wait for ONNX export with Node.js bindings
3. Consider using as LLM enhancement (not primary ASR)
