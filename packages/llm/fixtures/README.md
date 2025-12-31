# LLM Benchmark Fixtures

This directory contains audio samples and reference transcripts for benchmarking LLM text correction capabilities.

## Dataset: VoxPopuli

We use [VoxPopuli](https://huggingface.co/datasets/facebook/voxpopuli) - European Parliament recordings with professional transcripts. Perfect for testing LLM correction because:

- **Long samples** (1-3 minutes each) - enough text to evaluate correction quality
- **Multiple languages** (DE, FR, ES, PT, EN) - tests multilingual understanding
- **Formal speech** - clear pronunciation, good reference transcripts
- **Real-world content** - political speeches, not scripted readings

## Download Samples

```bash
# Install dependencies
pip install 'datasets<3' librosa soundfile

# Download samples (3 per language, ~15 total)
python download-voxpopuli.py

# Or for a specific language
python download-voxpopuli.py --lang de --samples 5
```

## Run Benchmark

```bash
# Prerequisites
ollama serve
ollama pull gemma3n:e4b qwen2.5:7b mistral:7b

# Run benchmark
pnpm --filter @cuttledoc/llm benchmark
```

## What the Benchmark Tests

1. **Transcribe** each audio sample with Parakeet (raw STT output)
2. **Correct** the raw transcript with each LLM model
3. **Compare** WER (Word Error Rate) before/after correction
4. **Measure** processing speed (tokens/second)

## Expected Output

```
📊 BENCHMARK SUMMARY
================================================================================

### Overall Performance

| Model         | Avg WER Before | Avg WER After | Improvement | Speed (tok/s) |
|---------------|----------------|---------------|-------------|---------------|
| gemma3n:e4b   |         15.2%  |        12.1%  |      +20.4% |           245 |
| qwen2.5:7b    |         15.2%  |        10.8%  |      +29.0% |           180 |
| mistral:7b    |         15.2%  |        11.5%  |      +24.3% |           195 |

### Recommendation

🏆 **Best Quality**: qwen2.5:7b (+29.0% WER improvement)
⚡ **Best Speed**: gemma3n:e4b (245 tokens/sec)
```

## Files

- `download-voxpopuli.py` - Download script
- `voxpopuli-{lang}-{id}.ogg` - Audio samples (not committed)
- `voxpopuli-{lang}-{id}.txt` - Reference transcripts
