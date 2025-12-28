#!/usr/bin/env python3
"""
Phi-4-multimodal ASR Prototype - Patched for Apple Silicon
Forces eager attention instead of FlashAttention2
"""

import sys
import time
import argparse
from pathlib import Path

def patch_flash_attention():
    """Patch transformers to disable FlashAttention checks"""
    import transformers.utils.import_utils as import_utils

    # Disable FlashAttention availability check
    original_is_flash_attn_2_available = import_utils.is_flash_attn_2_available
    import_utils.is_flash_attn_2_available = lambda: False

    # Also patch the greater_or_equal check
    if hasattr(import_utils, 'is_flash_attn_greater_or_equal_2_10'):
        import_utils.is_flash_attn_greater_or_equal_2_10 = lambda: False

    return original_is_flash_attn_2_available

def check_dependencies():
    """Check if required packages are installed"""
    missing = []
    try:
        import torch
    except ImportError:
        missing.append("torch")
    try:
        import transformers
    except ImportError:
        missing.append("transformers")
    try:
        import soundfile
    except ImportError:
        missing.append("soundfile")
    try:
        import librosa
    except ImportError:
        missing.append("librosa")

    if missing:
        print(f"Missing packages: {', '.join(missing)}")
        print(f"Install with: pip install {' '.join(missing)}")
        sys.exit(1)

def transcribe_audio(audio_path: str, device: str = "auto") -> dict:
    """
    Transcribe audio using Phi-4-multimodal

    Args:
        audio_path: Path to audio file
        device: "auto", "cpu", "cuda", or "mps"

    Returns:
        dict with transcription and timing info
    """
    import torch
    import librosa

    # Patch BEFORE importing model classes
    patch_flash_attention()

    from transformers import AutoModelForCausalLM, AutoProcessor, AutoConfig

    # Auto-detect best device
    if device == "auto":
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"

    print(f"Loading Phi-4-multimodal on {device}...")
    start_load = time.time()

    # Load model and processor
    model_id = "microsoft/Phi-4-multimodal-instruct"

    processor = AutoProcessor.from_pretrained(
        model_id,
        trust_remote_code=True
    )

    # Load config and force disable flash attention
    config = AutoConfig.from_pretrained(
        model_id,
        trust_remote_code=True
    )

    # Force eager attention everywhere
    config._attn_implementation = "eager"
    if hasattr(config, '_attn_implementation_internal'):
        config._attn_implementation_internal = "eager"
    if hasattr(config, '_flash_attn_2_enabled'):
        config._flash_attn_2_enabled = False

    # Determine dtype based on device
    if device == "cuda":
        dtype = torch.float16
    elif device == "mps":
        dtype = torch.float16  # MPS supports float16
    else:
        dtype = torch.float32

    print(f"  dtype: {dtype}")
    print(f"  attn_implementation: eager")

    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        config=config,
        trust_remote_code=True,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )

    # Move model to device
    print(f"  Moving model to {device}...")
    if device != "cpu":
        model = model.to(device)

    load_time = time.time() - start_load
    print(f"Model loaded in {load_time:.1f}s")

    # Load and preprocess audio
    print(f"Loading audio: {audio_path}")
    audio, sr = librosa.load(audio_path, sr=16000)
    audio_duration = len(audio) / sr
    print(f"Audio duration: {audio_duration:.1f}s")

    # Prepare prompt using chat template
    user_message = "<|audio_1|> Transcribe the audio to text."

    messages = [
        {"role": "user", "content": user_message}
    ]

    # Apply chat template
    prompt = processor.tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )

    print(f"Prompt: {prompt[:100]}...")

    # Process inputs
    print("Processing...")
    start_inference = time.time()

    # Audio must be tuple of (audio_data, sample_rate)
    inputs = processor(
        text=prompt,
        audios=[(audio, 16000)],
        return_tensors="pt"
    )

    # Move inputs to device
    if device != "cpu":
        inputs = {k: v.to(device) if hasattr(v, 'to') else v for k, v in inputs.items()}

    # Generate transcription
    print("Generating transcription...")
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=500,
            do_sample=False,
            pad_token_id=processor.tokenizer.pad_token_id,
        )

    inference_time = time.time() - start_inference

    # Decode output - skip input tokens
    input_len = inputs["input_ids"].shape[1]
    transcription = processor.decode(outputs[0][input_len:], skip_special_tokens=True).strip()

    rtf = inference_time / audio_duration

    return {
        "transcription": transcription,
        "audio_duration": audio_duration,
        "load_time": load_time,
        "inference_time": inference_time,
        "rtf": rtf,
        "device": device
    }


def main():
    parser = argparse.ArgumentParser(description="Phi-4-multimodal ASR Prototype (Patched)")
    parser.add_argument("audio", help="Path to audio file")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto",
                        help="Device to use (default: auto)")
    parser.add_argument("--reference", help="Path to reference transcription for WER")
    args = parser.parse_args()

    # Check dependencies
    check_dependencies()

    # Check if audio file exists
    if not Path(args.audio).exists():
        print(f"Error: Audio file not found: {args.audio}")
        sys.exit(1)

    # Transcribe
    result = transcribe_audio(args.audio, args.device)

    # Print results
    print("\n" + "="*60)
    print("TRANSCRIPTION:")
    print("="*60)
    print(result["transcription"])
    print("="*60)
    print(f"\nStats:")
    print(f"  Audio duration: {result['audio_duration']:.1f}s")
    print(f"  Model load time: {result['load_time']:.1f}s")
    print(f"  Inference time: {result['inference_time']:.1f}s")
    print(f"  RTF: {result['rtf']:.2f}x (< 1 = faster than realtime)")
    print(f"  Device: {result['device']}")

    # Calculate WER if reference provided
    if args.reference and Path(args.reference).exists():
        try:
            from jiwer import wer
            ref_text = Path(args.reference).read_text().strip()
            error_rate = wer(ref_text, result["transcription"])
            print(f"  WER: {error_rate*100:.2f}%")
        except ImportError:
            print("  (Install jiwer for WER calculation: pip install jiwer)")


if __name__ == "__main__":
    main()

