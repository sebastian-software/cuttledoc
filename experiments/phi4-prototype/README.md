# Phi-4-multimodal ASR Prototype

Quick & dirty prototype to evaluate Microsoft's Phi-4-multimodal for speech recognition.

## Goal

Test if Phi-4-multimodal is practical for cuttledoc integration:

- Does it work on CPU?
- What's the inference speed (RTF)?
- What's the quality (WER)?
- How much RAM does it need?

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
# Basic transcription
python transcribe.py ../path/to/audio.wav

# With CUDA (if available)
python transcribe.py audio.wav --device cuda

# With WER calculation (needs reference text)
python transcribe.py audio.wav --reference reference.txt
```

## Test with cuttledoc fixtures

```bash
# German fairytale
python transcribe.py ../../packages/cuttledoc/fixtures/fairytale-de.ogg \
  --reference ../../packages/cuttledoc/fixtures/fairytale-de.md

# English sample (if exists)
python transcribe.py ../../packages/cuttledoc/fixtures/sample-en.ogg \
  --reference ../../packages/cuttledoc/fixtures/sample-en.md
```

## Expected Results

| Metric    | Target  | Notes                            |
| --------- | ------- | -------------------------------- |
| WER       | < 6%    | Leaderboard shows 4.6%           |
| RTF       | < 1.0   | Faster than realtime             |
| RAM       | < 16 GB | Practical for local use          |
| Load time | < 60s   | First load (model caching helps) |

## Next Steps

If prototype is successful:

1. Export to ONNX for CPU
2. Create Node.js bindings
3. Integrate into cuttledoc as backend

If not practical:

- Document findings
- Consider alternative approaches (API, smaller model)
