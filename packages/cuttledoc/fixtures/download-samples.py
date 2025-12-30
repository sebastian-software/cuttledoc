#!/usr/bin/env python3
"""
Download speech samples from FLEURS dataset for WER benchmarking.

FLEURS (Few-shot Learning Evaluation of Universal Representations of Speech)
contains recordings from native speakers across 100+ languages.

Requirements:
    pip install 'datasets<3' librosa soundfile

Usage:
    python download-samples.py                  # All 5 languages, 10 samples each
    python download-samples.py --lang de        # German only
    python download-samples.py --samples 20     # 20 samples per language
"""

import argparse
import subprocess
from pathlib import Path

# Language codes for our 5 target languages
LANGUAGES = {
    "en": "en_us",
    "de": "de_de",
    "fr": "fr_fr",
    "es": "es_419",
    "pt": "pt_br",
}


def download_samples(lang: str, num_samples: int, output_dir: Path):
    """Download FLEURS samples for a language."""
    from datasets import load_dataset
    import soundfile as sf

    fleurs_code = LANGUAGES.get(lang)
    if not fleurs_code:
        print(f"Unknown language: {lang}. Available: {list(LANGUAGES.keys())}")
        return 0

    print(f"\nLoading FLEURS samples for {lang.upper()} ({fleurs_code})...")

    ds = load_dataset(
        "google/fleurs",
        fleurs_code,
        split="test",
        streaming=True,
        trust_remote_code=True,
    )

    downloaded = 0
    total_duration = 0.0

    for sample in ds:
        if downloaded >= num_samples:
            break

        audio = sample["audio"]
        transcription = sample["transcription"]
        duration = len(audio["array"]) / audio["sampling_rate"]

        # Save as WAV first
        wav_path = output_dir / f"_temp_{lang}_{downloaded}.wav"
        ogg_path = output_dir / f"fleurs-{lang}-{downloaded:03d}.ogg"
        txt_path = output_dir / f"fleurs-{lang}-{downloaded:03d}.txt"

        # Write WAV
        sf.write(wav_path, audio["array"], audio["sampling_rate"])

        # Convert to OGG
        try:
            subprocess.run(
                ["ffmpeg", "-i", str(wav_path), "-c:a", "libopus", "-b:a", "24k", str(ogg_path), "-y"],
                capture_output=True,
                check=True,
            )
            wav_path.unlink()
        except subprocess.CalledProcessError as e:
            print(f"  FFmpeg error: {e}")
            wav_path.unlink()
            continue

        # Write transcript
        txt_path.write_text(transcription, encoding="utf-8")

        total_duration += duration
        downloaded += 1
        print(f"  fleurs-{lang}-{downloaded-1:03d}.ogg: {transcription[:50]}...")

    print(f"✓ Downloaded {downloaded} samples ({total_duration:.0f}s total)")
    return downloaded


def main():
    parser = argparse.ArgumentParser(
        description="Download FLEURS samples for WER benchmarking"
    )
    parser.add_argument(
        "--lang",
        default="all",
        help="Language code (en/de/fr/es/pt) or 'all' for all languages",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=10,
        help="Number of samples per language (default: 10)",
    )
    args = parser.parse_args()

    output_dir = Path(__file__).parent

    total = 0
    if args.lang == "all":
        for lang in LANGUAGES:
            total += download_samples(lang, args.samples, output_dir)
    else:
        total = download_samples(args.lang, args.samples, output_dir)

    print(f"\n✓ Done! {total} samples saved to {output_dir}")
    print("\nTo run benchmarks:")
    print("  cuttledoc benchmark run --fixtures .")


if __name__ == "__main__":
    main()
