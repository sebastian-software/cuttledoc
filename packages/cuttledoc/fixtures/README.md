# Test Fixtures

Audio samples for integration testing and WER benchmarks.

## Included Samples (~1.7MB total)

| Language   | Samples | Duration | Source                   |
| ---------- | ------- | -------- | ------------------------ |
| English    | 10      | ~1.5 min | FLEURS (native speakers) |
| German     | 10      | ~2.6 min | FLEURS (native speakers) |
| French     | 10      | ~1.8 min | FLEURS (native speakers) |
| Spanish    | 10      | ~1.8 min | FLEURS (native speakers) |
| Portuguese | 10      | ~2.2 min | FLEURS (native speakers) |

**Total: 50 samples, ~10 minutes of audio**

Compressed with Opus codec at 24kbps. FLEURS contains recordings from
native speakers reading Wikipedia articles - more natural than audiobooks.

## Download Additional Samples

```bash
# Install dependencies
python3 -m venv .venv && source .venv/bin/activate
pip install 'datasets<3' librosa soundfile

# Download more samples
python download-samples.py --samples 20     # 20 samples per language
python download-samples.py --lang de        # German only
```

## Running Benchmarks

```bash
# Run all benchmarks (local + cloud)
pnpm --filter cuttledoc benchmark

# Only local backends (no API key needed)
pnpm --filter cuttledoc benchmark:local

# Only cloud backends (requires OPENAI_API_KEY)
pnpm --filter cuttledoc benchmark:cloud

# Specific backend
pnpm --filter cuttledoc benchmark -- --backend=whisper
```

See `scripts/benchmark.ts` for the benchmark implementation.

## License

FLEURS is released under CC BY 4.0 by Google.
