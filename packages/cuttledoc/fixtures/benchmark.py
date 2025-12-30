#!/usr/bin/env python3
"""
Run WER benchmark on FLEURS fixtures using sherpa-onnx.

Requirements:
    pip install sherpa-onnx jiwer soundfile

Usage:
    python benchmark.py
    python benchmark.py --model parakeet
    python benchmark.py --language en
"""

import argparse
import os
import time
from pathlib import Path

import sherpa_onnx
import soundfile as sf
from jiwer import wer

# Model configurations
MODELS = {
    "parakeet": {
        "type": "transducer",
        "encoder": "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/encoder.int8.onnx",
        "decoder": "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/decoder.int8.onnx",
        "joiner": "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/joiner.int8.onnx",
        "tokens": "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/tokens.txt",
    },
    "whisper-large-v3": {
        "type": "whisper",
        "encoder": "sherpa-onnx-whisper-large-v3/large-v3-encoder.int8.onnx",
        "decoder": "sherpa-onnx-whisper-large-v3/large-v3-decoder.int8.onnx",
        "tokens": "sherpa-onnx-whisper-large-v3/large-v3-tokens.txt",
    },
    # Note: whisper-distil-* models are English-only and not included here.
    # They have >100% WER for non-English languages.
}

LANGUAGES = ["en", "de", "fr", "es", "pt"]


def create_recognizer(model_name: str, models_dir: Path, language: str = "en"):
    """Create a sherpa-onnx recognizer for the given model."""
    config = MODELS[model_name]

    if config["type"] == "transducer":
        return sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=str(models_dir / config["encoder"]),
            decoder=str(models_dir / config["decoder"]),
            joiner=str(models_dir / config["joiner"]),
            tokens=str(models_dir / config["tokens"]),
            num_threads=4,
        )
    else:  # whisper
        return sherpa_onnx.OfflineRecognizer.from_whisper(
            encoder=str(models_dir / config["encoder"]),
            decoder=str(models_dir / config["decoder"]),
            tokens=str(models_dir / config["tokens"]),
            num_threads=4,
            language=language,
            task="transcribe",
        )


def transcribe(recognizer, audio_path: Path) -> tuple[str, float]:
    """Transcribe audio file, return (text, rtf)."""
    audio, sample_rate = sf.read(audio_path)

    if len(audio.shape) > 1:
        audio = audio.mean(axis=1)

    duration = len(audio) / sample_rate

    stream = recognizer.create_stream()
    stream.accept_waveform(sample_rate, audio)

    start = time.time()
    recognizer.decode_stream(stream)
    elapsed = time.time() - start

    rtf = elapsed / duration if duration > 0 else 0

    return stream.result.text.strip(), rtf


def normalize_text(text: str) -> str:
    """Normalize text for WER calculation."""
    import re
    text = text.lower()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def run_benchmark(models_dir: Path, fixtures_dir: Path, model_filter: str = None, lang_filter: str = None):
    """Run benchmark on all fixtures."""
    results = {}

    # Find all models to test
    models_to_test = []
    for model_name, config in MODELS.items():
        if model_filter and model_filter not in model_name:
            continue
        # Check if model exists
        if config["type"] == "transducer":
            model_path = models_dir / config["encoder"]
        else:
            model_path = models_dir / config["encoder"]
        if model_path.exists():
            models_to_test.append(model_name)

    if not models_to_test:
        print(f"No models found in {models_dir}")
        return {}

    print(f"🔬 Testing {len(models_to_test)} models: {', '.join(models_to_test)}")

    # Find all fixtures
    languages = [lang_filter] if lang_filter else LANGUAGES

    for model_name in models_to_test:
        print(f"\n⏱️  {model_name}")
        results[model_name] = {}

        for lang in languages:
            fixtures = list(fixtures_dir.glob(f"fleurs-{lang}-*.ogg"))
            if not fixtures:
                continue

            print(f"   {lang.upper()}: ", end="", flush=True)

            try:
                recognizer = create_recognizer(model_name, models_dir, lang)
            except Exception as e:
                print(f"Error loading model: {e}")
                continue

            total_wer = 0
            total_rtf = 0
            count = 0

            for audio_path in sorted(fixtures):
                txt_path = audio_path.with_suffix(".txt")
                if not txt_path.exists():
                    continue

                reference = normalize_text(txt_path.read_text(encoding="utf-8"))
                hypothesis, rtf = transcribe(recognizer, audio_path)
                hypothesis = normalize_text(hypothesis)

                if reference and hypothesis:
                    sample_wer = wer(reference, hypothesis)
                    total_wer += sample_wer
                    total_rtf += rtf
                    count += 1

            if count > 0:
                avg_wer = total_wer / count
                avg_rtf = total_rtf / count
                results[model_name][lang] = {"wer": avg_wer, "rtf": avg_rtf}
                print(f"WER={avg_wer:.1%}, RTF={avg_rtf:.2f}")
            else:
                print("No samples")

    return results


def print_results_table(results: dict):
    """Print results as markdown table."""
    if not results:
        return

    print("\n## WER Results (lower is better)\n")
    print("| Model | EN | DE | FR | ES | PT | Avg |")
    print("|-------|----|----|----|----|----|----|")

    for model, langs in results.items():
        row = f"| {model} |"
        values = []
        for lang in LANGUAGES:
            if lang in langs:
                val = langs[lang]["wer"] * 100
                row += f" {val:.1f}% |"
                values.append(val)
            else:
                row += " - |"
        if values:
            avg = sum(values) / len(values)
            row += f" {avg:.1f}% |"
        else:
            row += " - |"
        print(row)

    print("\n## RTF Results (lower is faster)\n")
    print("| Model | EN | DE | FR | ES | PT | Avg |")
    print("|-------|----|----|----|----|----|----|")

    for model, langs in results.items():
        row = f"| {model} |"
        values = []
        for lang in LANGUAGES:
            if lang in langs:
                val = langs[lang]["rtf"]
                row += f" {val:.2f} |"
                values.append(val)
            else:
                row += " - |"
        if values:
            avg = sum(values) / len(values)
            row += f" {avg:.2f} |"
        else:
            row += " - |"
        print(row)


def main():
    parser = argparse.ArgumentParser(description="Run WER benchmark on FLEURS fixtures")
    parser.add_argument("--models-dir", type=Path, default=Path(__file__).parent.parent.parent.parent / "models",
                        help="Directory containing sherpa-onnx models")
    parser.add_argument("--model", help="Filter by model name")
    parser.add_argument("--language", help="Filter by language (en/de/fr/es/pt)")
    args = parser.parse_args()

    fixtures_dir = Path(__file__).parent

    print(f"📁 Models: {args.models_dir}")
    print(f"📁 Fixtures: {fixtures_dir}")

    results = run_benchmark(args.models_dir, fixtures_dir, args.model, args.language)
    print_results_table(results)


if __name__ == "__main__":
    main()

