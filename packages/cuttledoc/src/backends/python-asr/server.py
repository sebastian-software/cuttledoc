#!/usr/bin/env python3
"""
Unified Python ASR Server

A generic HTTP server that provides speech recognition via multiple backends:
- phi4: Microsoft Phi-4-multimodal (best quality for EN/DE/ES)
- canary: NVIDIA Canary-1B-v2 (25 EU languages)

Run with: python server.py [--port 8765] [--backend phi4|canary]

The server auto-detects the best device (CUDA > MPS > CPU) and loads
the model on first request. Model stays cached for subsequent requests.
"""

import argparse
import json
import sys
import time
from abc import ABC, abstractmethod
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Optional

# =============================================================================
# Abstract Backend Interface
# =============================================================================

class ASRBackend(ABC):
    """Abstract base class for ASR backends"""
    
    name: str = "base"
    supported_languages: list[str] = []
    
    @abstractmethod
    def load(self, device: str) -> None:
        """Load the model onto the specified device"""
        pass
    
    @abstractmethod
    def transcribe(self, audio_path: str, language: Optional[str] = None) -> dict:
        """
        Transcribe audio file
        
        Returns:
            dict with keys: text, duration_seconds, processing_seconds, language, device
        """
        pass
    
    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        pass


# =============================================================================
# Phi-4 Backend
# =============================================================================

class Phi4Backend(ASRBackend):
    """Microsoft Phi-4-multimodal backend"""
    
    name = "phi4"
    supported_languages = ["en", "de", "fr", "es", "it", "pt", "zh", "ja"]
    
    def __init__(self):
        self.model = None
        self.processor = None
        self.device = None
        self._lang_names = {
            "en": "English", "de": "German", "fr": "French", "es": "Spanish",
            "it": "Italian", "pt": "Portuguese", "zh": "Chinese", "ja": "Japanese"
        }
    
    @property
    def is_loaded(self) -> bool:
        return self.model is not None
    
    def load(self, device: str) -> None:
        if self.is_loaded:
            return
        
        # Patch FlashAttention before importing
        self._patch_flash_attention()
        
        import torch
        from transformers import AutoModelForCausalLM, AutoProcessor, AutoConfig
        
        model_id = "microsoft/Phi-4-multimodal-instruct"
        print(f"[phi4] Loading {model_id} on {device}...")
        start = time.time()
        
        # Load processor
        self.processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
        
        # Load config with eager attention (no FlashAttention)
        config = AutoConfig.from_pretrained(model_id, trust_remote_code=True)
        config._attn_implementation = "eager"
        config._attn_implementation_autoset = False
        
        # Determine dtype
        dtype = torch.float16 if device in ("cuda", "mps") else torch.float32
        
        # Load model
        self.model = AutoModelForCausalLM.from_pretrained(
            model_id,
            config=config,
            trust_remote_code=True,
            torch_dtype=dtype,
            low_cpu_mem_usage=True
        )
        
        if device != "cpu":
            self.model = self.model.to(device)
        
        self.device = device
        print(f"[phi4] Model loaded in {time.time() - start:.1f}s")
    
    def transcribe(self, audio_path: str, language: Optional[str] = None) -> dict:
        import torch
        import librosa
        
        start = time.time()
        
        # Load audio
        audio, sr = librosa.load(audio_path, sr=16000)
        duration = len(audio) / sr
        
        # Build prompt with language hint
        lang_code = language.split("-")[0] if language else None
        if lang_code and lang_code in self._lang_names:
            lang_name = self._lang_names[lang_code]
            user_message = f"<|audio_1|> Transcribe the audio to {lang_name} text."
        else:
            user_message = "<|audio_1|> Transcribe the audio to text."
        
        messages = [{"role": "user", "content": user_message}]
        prompt = self.processor.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        
        # Process inputs
        inputs = self.processor(
            text=prompt,
            audios=[(audio, 16000)],
            return_tensors="pt"
        )
        
        if self.device != "cpu":
            inputs = {k: v.to(self.device) if hasattr(v, 'to') else v for k, v in inputs.items()}
        
        # Generate
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=500,
                do_sample=False,
                pad_token_id=self.processor.tokenizer.pad_token_id
            )
        
        # Decode
        input_len = inputs["input_ids"].shape[1]
        text = self.processor.decode(outputs[0][input_len:], skip_special_tokens=True).strip()
        
        return {
            "text": text,
            "duration_seconds": duration,
            "processing_seconds": time.time() - start,
            "language": language or "auto",
            "device": self.device,
            "backend": self.name
        }
    
    def _patch_flash_attention(self):
        """Disable FlashAttention checks"""
        import transformers.utils.import_utils as import_utils
        import_utils.is_flash_attn_2_available = lambda: False
        if hasattr(import_utils, 'is_flash_attn_greater_or_equal_2_10'):
            import_utils.is_flash_attn_greater_or_equal_2_10 = lambda: False


# =============================================================================
# Canary Backend
# =============================================================================

class CanaryBackend(ASRBackend):
    """NVIDIA Canary-1B-v2 backend"""
    
    name = "canary"
    supported_languages = [
        "en", "de", "fr", "es", "it", "pt", "nl", "pl", "cs", "sk",
        "hu", "ro", "bg", "el", "sv", "da", "fi", "no", "hr", "sl",
        "et", "lv", "lt", "mt", "uk", "ru"
    ]
    
    def __init__(self):
        self.model = None
        self.device = None
    
    @property
    def is_loaded(self) -> bool:
        return self.model is not None
    
    def load(self, device: str) -> None:
        if self.is_loaded:
            return
        
        from nemo.collections.asr.models import EncDecMultiTaskModel
        
        model_id = "nvidia/canary-1b-v2"
        print(f"[canary] Loading {model_id} on {device}...")
        start = time.time()
        
        # Load model
        self.model = EncDecMultiTaskModel.from_pretrained(model_id)
        
        # Configure decoding
        decode_cfg = self.model.cfg.decoding
        decode_cfg.beam.beam_size = 1
        self.model.change_decoding_strategy(decode_cfg)
        
        # Move to device
        if device == "cuda":
            self.model = self.model.cuda()
        # Note: NeMo doesn't support MPS well, fallback to CPU
        
        self.device = device if device == "cuda" else "cpu"
        print(f"[canary] Model loaded in {time.time() - start:.1f}s")
    
    def transcribe(self, audio_path: str, language: Optional[str] = None) -> dict:
        import tempfile
        import json
        import soundfile as sf
        
        start = time.time()
        
        # Get audio duration
        info = sf.info(audio_path)
        duration = info.duration
        
        # Determine source language
        lang_code = language.split("-")[0] if language else "en"
        if lang_code not in self.supported_languages:
            lang_code = "en"
        
        # Create manifest file for NeMo
        manifest_data = {
            "audio_filepath": str(Path(audio_path).absolute()),
            "source_lang": lang_code,
            "target_lang": lang_code,  # Same as source for ASR (not translation)
            "taskname": "asr",
            "pnc": "yes",
            "duration": duration
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write(json.dumps(manifest_data) + '\n')
            manifest_path = f.name
        
        try:
            # Transcribe using manifest
            output = self.model.transcribe(
                manifest_path,
                batch_size=1
            )
            
            # Extract text from output
            if isinstance(output, list) and len(output) > 0:
                if hasattr(output[0], 'text'):
                    text = output[0].text
                else:
                    text = str(output[0])
            else:
                text = str(output)
            
        finally:
            # Clean up manifest
            Path(manifest_path).unlink(missing_ok=True)
        
        return {
            "text": text.strip() if isinstance(text, str) else text,
            "duration_seconds": duration,
            "processing_seconds": time.time() - start,
            "language": lang_code,
            "device": self.device,
            "backend": self.name
        }


# =============================================================================
# HTTP Server
# =============================================================================

# Global backend instance
backend: Optional[ASRBackend] = None
backend_name: str = "phi4"


def detect_device() -> str:
    """Auto-detect best available device"""
    import torch
    if torch.cuda.is_available():
        return "cuda"
    elif torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def get_backend(name: str) -> ASRBackend:
    """Get backend instance by name"""
    backends = {
        "phi4": Phi4Backend,
        "canary": CanaryBackend
    }
    if name not in backends:
        raise ValueError(f"Unknown backend: {name}. Available: {list(backends.keys())}")
    return backends[name]()


class ASRHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Quiet logging
    
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "backend": backend_name,
                "model_loaded": backend.is_loaded if backend else False,
                "supported_languages": backend.supported_languages if backend else []
            }).encode())
        elif self.path == "/backends":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "available": ["phi4", "canary"],
                "current": backend_name,
                "phi4": {"languages": Phi4Backend.supported_languages},
                "canary": {"languages": CanaryBackend.supported_languages}
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        global backend, backend_name
        
        if self.path == "/transcribe":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode()
            
            try:
                data = json.loads(body)
                audio_path = data.get("audio_path")
                language = data.get("language")
                requested_backend = data.get("backend", backend_name)
                
                if not audio_path or not Path(audio_path).exists():
                    self._send_error(400, f"Audio file not found: {audio_path}")
                    return
                
                # Switch backend if needed
                if requested_backend != backend_name or backend is None:
                    backend_name = requested_backend
                    backend = get_backend(backend_name)
                
                # Load model if needed
                if not backend.is_loaded:
                    device = detect_device()
                    backend.load(device)
                
                # Transcribe
                result = backend.transcribe(audio_path, language)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
                
            except Exception as e:
                self._send_error(500, str(e))
        
        elif self.path == "/switch":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode()
            
            try:
                data = json.loads(body)
                new_backend = data.get("backend")
                
                if new_backend not in ["phi4", "canary"]:
                    self._send_error(400, f"Unknown backend: {new_backend}")
                    return
                
                backend_name = new_backend
                backend = get_backend(backend_name)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "ok",
                    "backend": backend_name,
                    "message": f"Switched to {backend_name}. Model will load on next transcribe."
                }).encode())
                
            except Exception as e:
                self._send_error(500, str(e))
        else:
            self.send_response(404)
            self.end_headers()
    
    def _send_error(self, code: int, message: str):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())


def main():
    global backend, backend_name
    
    parser = argparse.ArgumentParser(description="Unified Python ASR Server")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument("--backend", choices=["phi4", "canary"], default="phi4",
                        help="Default backend to use")
    parser.add_argument("--preload", action="store_true", help="Preload model on startup")
    args = parser.parse_args()
    
    backend_name = args.backend
    backend = get_backend(backend_name)
    
    if args.preload:
        device = detect_device()
        backend.load(device)
    
    server = HTTPServer(("127.0.0.1", args.port), ASRHandler)
    print(f"ASR Server listening on http://127.0.0.1:{args.port}")
    print(f"Default backend: {backend_name}")
    print("Endpoints:")
    print("  GET  /health      - Health check")
    print("  GET  /backends    - List available backends")
    print("  POST /transcribe  - Transcribe audio")
    print("  POST /switch      - Switch backend")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()

