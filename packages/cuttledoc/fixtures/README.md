# Test Fixtures

This directory is for audio files used in integration testing and WER benchmarks.

## Getting Started

To run integration tests and benchmarks, you need audio files with matching reference transcripts.

### Quick Start: Download LibriSpeech Samples

We provide a script to download samples from [LibriSpeech](https://www.openslr.org/12/) and [Multilingual LibriSpeech](https://www.openslr.org/94/) (public domain speech datasets):

```bash
# Install dependencies (use venv for macOS)
python3 -m venv .venv && source .venv/bin/activate
pip install 'datasets[audio]' soundfile

# Download samples for all 5 benchmark languages (EN, DE, FR, ES, PT)
python download-samples.py

# Or download specific language
python download-samples.py --lang de --samples 10
```

Supported languages: 🇬🇧 en, 🇩🇪 de, 🇫🇷 fr, 🇪🇸 es, 🇧🇷 pt (via LibriSpeech / Multilingual LibriSpeech)

### File Naming Convention

```
<name>-<language>.ogg   # Audio file (any format: wav, mp3, ogg, m4a)
<name>-<language>.md    # Reference transcript (plain text or markdown)
```

Examples:

- `librispeech-de-001.wav` + `librispeech-de-001.txt`
- `librispeech-en-001.wav` + `librispeech-en-001.txt`

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

Audio fixtures are not included in the repository (too large). Use properly licensed datasets:

- **FLEURS**: Apache 2.0 license (Google)
- **LibriSpeech**: Public domain
- **Common Voice**: CC0 license (Mozilla)
