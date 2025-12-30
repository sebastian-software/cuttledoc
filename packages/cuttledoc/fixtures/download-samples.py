#!/usr/bin/env python3
"""
Download speech benchmark samples for WER testing.

Datasets:
- LibriSpeech (English): Public domain, clean read speech
- Multilingual LibriSpeech (German, French, etc.): Public domain

Usage:
    python download-samples.py              # Download all 5 languages (EN, DE, FR, ES, PT)
    python download-samples.py --lang de    # Download only German
    python download-samples.py --samples 10 # Download 10 samples per language

Requirements:
    pip install 'datasets[audio]' soundfile
"""

import argparse
import sys
from pathlib import Path


def check_dependencies():
    """Check if required packages are installed."""
    missing = []
    try:
        import datasets  # noqa: F401
    except ImportError:
        missing.append("datasets")
    try:
        import soundfile  # noqa: F401
    except ImportError:
        missing.append("soundfile")

    if missing:
        print(f"Missing packages: {', '.join(missing)}")
        print(f"Install with: pip install {' '.join(missing)}")
        sys.exit(1)


def download_samples(language: str, num_samples: int, output_dir: Path):
    """Download speech samples for a given language."""
    from datasets import load_dataset
    import soundfile as sf
    import numpy as np

    print(f"Loading samples for {language}...")

    try:
        if language == "en":
            # LibriSpeech for English (clean, well-known benchmark)
            dataset = load_dataset(
                "openslr/librispeech_asr",
                "clean",
                split=f"test[:{num_samples}]",
            )
            text_key = "text"
        elif language == "de":
            # Multilingual LibriSpeech for German
            dataset = load_dataset(
                "facebook/multilingual_librispeech",
                "german",
                split=f"test[:{num_samples}]",
            )
            text_key = "transcript"
        elif language == "fr":
            # Multilingual LibriSpeech for French
            dataset = load_dataset(
                "facebook/multilingual_librispeech",
                "french",
                split=f"test[:{num_samples}]",
            )
            text_key = "transcript"
        elif language == "es":
            # Multilingual LibriSpeech for Spanish
            dataset = load_dataset(
                "facebook/multilingual_librispeech",
                "spanish",
                split=f"test[:{num_samples}]",
            )
            text_key = "transcript"
        elif language == "it":
            # Multilingual LibriSpeech for Italian
            dataset = load_dataset(
                "facebook/multilingual_librispeech",
                "italian",
                split=f"test[:{num_samples}]",
            )
            text_key = "transcript"
        elif language == "pt":
            # Multilingual LibriSpeech for Portuguese
            dataset = load_dataset(
                "facebook/multilingual_librispeech",
                "portuguese",
                split=f"test[:{num_samples}]",
            )
            text_key = "transcript"
        elif language == "nl":
            # Multilingual LibriSpeech for Dutch
            dataset = load_dataset(
                "facebook/multilingual_librispeech",
                "dutch",
                split=f"test[:{num_samples}]",
            )
            text_key = "transcript"
        elif language == "pl":
            # Multilingual LibriSpeech for Polish
            dataset = load_dataset(
                "facebook/multilingual_librispeech",
                "polish",
                split=f"test[:{num_samples}]",
            )
            text_key = "transcript"
        else:
            print(f"Language '{language}' not directly supported.")
            print("Supported: en, de, fr, es, it, pt, nl, pl")
            return 0

    except Exception as e:
        print(f"Error loading dataset for {language}: {e}")
        return 0

    output_dir.mkdir(parents=True, exist_ok=True)
    count = 0

    for i, sample in enumerate(dataset):
        audio = sample["audio"]
        transcript = sample.get(text_key, "")

        # Get audio data
        audio_array = audio["array"]
        sample_rate = audio["sampling_rate"]

        # Convert to float32 if needed
        if audio_array.dtype != np.float32:
            audio_array = audio_array.astype(np.float32)

        # Normalize if needed
        if audio_array.max() > 1.0:
            audio_array = audio_array / 32768.0

        # Save audio as WAV
        audio_path = output_dir / f"librispeech-{language}-{i:03d}.wav"
        sf.write(audio_path, audio_array, sample_rate)

        # Save reference transcript
        ref_path = output_dir / f"librispeech-{language}-{i:03d}.txt"
        ref_path.write_text(transcript.strip(), encoding="utf-8")

        # Truncate for display
        display_text = transcript[:50] + "..." if len(transcript) > 50 else transcript
        print(f"  {audio_path.name}: {display_text}")
        count += 1

    return count


def main():
    parser = argparse.ArgumentParser(
        description="Download speech benchmark samples for WER testing"
    )
    parser.add_argument(
        "--lang",
        type=str,
        default=None,
        help="Language code (en, de, fr, es, pt). Default: all 5 languages",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=5,
        help="Number of samples per language (default: 5)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output directory (default: same as this script)",
    )
    args = parser.parse_args()

    check_dependencies()

    output_dir = Path(args.output) if args.output else Path(__file__).parent

    languages = [args.lang] if args.lang else ["en", "de", "fr", "es", "pt"]
    total = 0

    for lang in languages:
        count = download_samples(lang, args.samples, output_dir)
        total += count

    if total > 0:
        print(f"\n✓ Downloaded {total} samples to {output_dir}")
        print("\nTo run benchmarks:")
        print("  cuttledoc benchmark run --fixtures .")
    else:
        print("\n✗ No samples downloaded")


if __name__ == "__main__":
    main()
