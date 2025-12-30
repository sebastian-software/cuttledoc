# Test Fixtures

This directory is for audio files used in integration testing and WER benchmarks.

## Getting Started

To run integration tests and benchmarks, you need audio files with matching reference transcripts.

### Recommended: FLEURS Dataset

For standardized WER benchmarking, we recommend using samples from the [FLEURS dataset](https://huggingface.co/datasets/google/fleurs) (Google's multilingual speech benchmark):

```bash
# Download FLEURS samples using Hugging Face datasets
pip install datasets soundfile

# Python script to extract test samples
python -c "
from datasets import load_dataset
import soundfile as sf

# Load German test split (or any of the 102 languages)
ds = load_dataset('google/fleurs', 'de_de', split='test[:10]')

for i, sample in enumerate(ds):
    sf.write(f'fleurs-de-{i:03d}.wav', sample['audio']['array'], sample['audio']['sampling_rate'])
    with open(f'fleurs-de-{i:03d}.txt', 'w') as f:
        f.write(sample['transcription'])
"
```

### File Naming Convention

```
<name>-<language>.ogg   # Audio file (any format: wav, mp3, ogg, m4a)
<name>-<language>.md    # Reference transcript (plain text or markdown)
```

Examples:

- `fleurs-de-001.wav` + `fleurs-de-001.md`
- `librispeech-en-001.ogg` + `librispeech-en-001.md`

### Running Benchmarks

```bash
# Run benchmark on all fixtures
cuttledoc benchmark run

# Run for specific language
cuttledoc benchmark run --language de

# Compare specific models
cuttledoc benchmark run parakeet-tdt-0.6b-v3 whisper-large-v3
```

## License Note

Audio fixtures are not included in the repository. Use properly licensed datasets:

- **FLEURS**: Apache 2.0 license
- **LibriSpeech**: Public domain
- **Common Voice**: CC0 license
