#!/usr/bin/env python3
"""
Phi-4-multimodal ASR Prototype
Quick & dirty test to evaluate if Phi-4 is practical for cuttledoc
"""

import sys
import time
import argparse
from pathlib import Path

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
    from transformers import AutoModelForCausalLM, AutoProcessor, AutoConfig
    import soundfile as sf
    import librosa

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

    # Load config and force disable flash attention (not available on MPS/CPU)
    config = AutoConfig.from_pretrained(
        model_id,
        trust_remote_code=True
    )
    config._attn_implementation = "eager"
    config._attn_implementation_internal = "eager"

    # Determine dtype based on device
    if device == "cuda":
        dtype = torch.float16
    elif device == "mps":
        dtype = torch.float16  # MPS supports float16
    else:
        dtype = torch.float32

    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        config=config,
        trust_remote_code=True,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
        attn_implementation="eager",  # Disable FlashAttention
    )

    # Move model to device
    if device != "cpu":
        model = model.to(device)

    # Model is already on correct device after .to() call above

    load_time = time.time() - start_load
    print(f"Model loaded in {load_time:.1f}s")

    # Load and preprocess audio
    print(f"Loading audio: {audio_path}")
    audio, sr = librosa.load(audio_path, sr=16000)
    audio_duration = len(audio) / sr
    print(f"Audio duration: {audio_duration:.1f}s")

    # Prepare prompt for transcription
    # Phi-4-multimodal uses a chat format with audio placeholder
    prompt = "<|audio|>\nTranscribe this audio to text. Output only the transcription, nothing else."

    # Process inputs
    print("Processing...")
    start_inference = time.time()

    inputs = processor(
        text=prompt,
        audios=[audio],
        return_tensors="pt",
        sampling_rate=16000
    )

    if device == "cuda":
        inputs = {k: v.to("cuda") if hasattr(v, 'to') else v for k, v in inputs.items()}

    # Generate transcription
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=500,
            do_sample=False,
            pad_token_id=processor.tokenizer.pad_token_id,
        )

    inference_time = time.time() - start_inference

    # Decode output
    transcription = processor.decode(outputs[0], skip_special_tokens=True)

    # Clean up - remove the prompt from output
    if prompt in transcription:
        transcription = transcription.replace(prompt, "").strip()

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
    parser = argparse.ArgumentParser(description="Phi-4-multimodal ASR Prototype")
    parser.add_argument("audio", help="Path to audio file")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto",
                        help="Device to use (default: auto - uses MPS on Apple Silicon)")
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

