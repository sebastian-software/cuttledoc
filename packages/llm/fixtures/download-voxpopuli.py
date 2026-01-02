#!/usr/bin/env python3
"""
Download speech samples from VoxPopuli dataset for LLM correction benchmarking.

VoxPopuli contains European Parliament recordings (2-5 min each) in multiple languages.
Perfect for testing LLM text correction capabilities.

Requirements:
    pip install 'datasets<3' librosa soundfile

Usage:
    python download-voxpopuli.py                  # All 5 languages, 3 samples each
    python download-voxpopuli.py --lang de        # German only
    python download-voxpopuli.py --samples 5      # 5 samples per language
"""

import argparse
import subprocess
from pathlib import Path

# Language codes for our 5 target languages
LANGUAGES = ["en", "de", "fr", "es", "pt"]

# Target duration per sample (seconds)
MIN_DURATION = 60  # At least 1 minute
MAX_DURATION = 180  # At most 3 minutes


def download_samples(lang: str, num_samples: int, output_dir: Path):
    """Download VoxPopuli samples for a language."""
    from datasets import load_dataset
    import soundfile as sf

    print(f"\nLoading VoxPopuli samples for {lang.upper()}...")

    try:
        ds = load_dataset(
            "facebook/voxpopuli",
            lang,
            split="test",
            streaming=True,
            trust_remote_code=True,
        )
    except Exception as e:
        print(f"  Error loading dataset: {e}")
        return 0

    downloaded = 0
    total_duration = 0.0

    for sample in ds:
        if downloaded >= num_samples:
            break

        audio = sample["audio"]
        transcription = sample.get("normalized_text") or sample.get("raw_text", "")

        if not transcription or len(transcription.strip()) < 50:
            continue  # Skip samples without good transcription

        duration = len(audio["array"]) / audio["sampling_rate"]

        # Filter by duration
        if duration < MIN_DURATION or duration > MAX_DURATION:
            continue

        # Save as WAV first
        wav_path = output_dir / f"_temp_{lang}_{downloaded}.wav"
        ogg_path = output_dir / f"voxpopuli-{lang}-{downloaded:03d}.ogg"
        txt_path = output_dir / f"voxpopuli-{lang}-{downloaded:03d}.txt"

        # Write WAV
        sf.write(wav_path, audio["array"], audio["sampling_rate"])

        # Convert to OGG (higher quality for longer samples)
        try:
            subprocess.run(
                ["ffmpeg", "-i", str(wav_path), "-c:a", "libopus", "-b:a", "48k", str(ogg_path), "-y"],
                capture_output=True,
                check=True,
            )
            wav_path.unlink()
        except subprocess.CalledProcessError as e:
            print(f"  FFmpeg error: {e}")
            wav_path.unlink()
            continue

        # Write transcript (reference)
        txt_path.write_text(transcription.strip(), encoding="utf-8")

        total_duration += duration
        downloaded += 1
        word_count = len(transcription.split())
        print(f"  voxpopuli-{lang}-{downloaded-1:03d}.ogg: {duration:.0f}s, {word_count} words")

    print(f"✓ Downloaded {downloaded} samples ({total_duration/60:.1f} min total)")
    return downloaded


def main():
    parser = argparse.ArgumentParser(
        description="Download VoxPopuli samples for LLM benchmarking"
    )
    parser.add_argument(
        "--lang",
        default="all",
        help="Language code (en/de/fr/es/pt) or 'all' for all languages",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=3,
        help="Number of samples per language (default: 3)",
    )
    args = parser.parse_args()

    output_dir = Path(__file__).parent
    output_dir.mkdir(exist_ok=True)

    total = 0
    if args.lang == "all":
        for lang in LANGUAGES:
            total += download_samples(lang, args.samples, output_dir)
    else:
        total = download_samples(args.lang, args.samples, output_dir)

    print(f"\n✓ Done! {total} samples saved to {output_dir}")
    print("\nNext: Run the LLM benchmark:")
    print("  pnpm --filter @cuttledoc/llm benchmark")


if __name__ == "__main__":
    main()

