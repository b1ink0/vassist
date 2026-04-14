"""
Faster Whisper STT Server
GPU-accelerated speech-to-text using faster-whisper with CUDA support
OpenAI-compatible API endpoint
"""

import os
import sys
import io
import tempfile
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from pydantic import BaseModel

# Initialize FastAPI app
app = FastAPI(title="Faster Whisper STT API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instance
whisper_model = None
model_name = None
active_device = "cpu"
active_compute_type = "int8"
WHISPER_MODEL_DIR = Path(os.environ.get("WHISPER_MODEL_DIR", str(Path(__file__).parent / "models")))
WHISPER_MODEL_DIR.mkdir(parents=True, exist_ok=True)


try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def whisper_log(message):
    msg = str(message)
    try:
        print(msg, flush=True)
        return
    except Exception:
        pass

    try:
        encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
        sys.stdout.buffer.write((msg + "\n").encode(encoding, errors="replace"))
        sys.stdout.flush()
    except Exception:
        pass


def normalize_model_name(model_name_str):
    raw = (model_name_str or "tiny").strip().lower().replace("_", "-")
    mapping = {
        "whisper-1": "tiny",
        "whisper": "tiny",
        "tiny": "tiny",
        "tiny.en": "tiny.en",
        "base": "base",
        "base.en": "base.en",
    }
    return mapping.get(raw, "tiny")

def load_model(model_name_str="tiny.en", device="cuda", compute_type="float16"):
    """Load faster-whisper model with GPU support"""
    global whisper_model, model_name, active_device, active_compute_type
    model_name_str = normalize_model_name(model_name_str)
    
    try:
        from faster_whisper import WhisperModel
        
        whisper_log(f"[Whisper] Loading model: {model_name_str} on {device} with {compute_type}")
        
        # Try CUDA first, fall back to CPU
        try:
            whisper_model = WhisperModel(
                model_name_str, 
                device=device,
                compute_type=compute_type,
                download_root=str(WHISPER_MODEL_DIR)
            )
            model_name = model_name_str
            active_device = device
            active_compute_type = compute_type
            whisper_log(f"[Whisper] Model loaded successfully on {device}")
        except Exception as e:
            whisper_log(f"[Whisper] GPU failed, falling back to CPU: {e}")
            whisper_model = WhisperModel(
                model_name_str,
                device="cpu",
                compute_type="int8",
                download_root=str(WHISPER_MODEL_DIR)
            )
            model_name = model_name_str
            active_device = "cpu"
            active_compute_type = "int8"
            whisper_log("[Whisper] Model loaded on CPU")
            
    except ImportError:
        whisper_log("[Whisper] ERROR: faster-whisper not installed")
        raise
    except Exception as e:
        whisper_log(f"[Whisper] ERROR loading model: {e}")
        raise

@app.on_event("startup")
async def startup():
    """Initialize model on startup"""
    # Check for CUDA availability
    device = "cuda"
    compute_type = "float16"
    
    try:
        import torch
        if not torch.cuda.is_available():
            whisper_log("[Whisper] CUDA not available, using CPU")
            device = "cpu"
            compute_type = "int8"
        else:
            whisper_log(f"[Whisper] CUDA available: {torch.cuda.get_device_name(0)}")
    except:
        whisper_log("[Whisper] PyTorch not available, using CPU")
        device = "cpu"
        compute_type = "int8"
    
    # Load configurable default model on startup (default: multilingual tiny)
    default_model = normalize_model_name(os.environ.get("WHISPER_DEFAULT_MODEL", "tiny"))
    load_model(default_model, device=device, compute_type=compute_type)

@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(default="whisper-1"),
    language: str = Form(default="en"),
    temperature: float = Form(default=0.0)
):
    """
    OpenAI-compatible transcription endpoint
    
    Accepts multipart/form-data with audio file
    Returns JSON: {"text": "transcribed text"}
    """
    if not whisper_model:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        requested_model = normalize_model_name(model)
        if requested_model != model_name:
            whisper_log(f"[Whisper] Switching model from {model_name} to {requested_model}")
            load_model(requested_model, device=active_device, compute_type=active_compute_type)

        # Read audio data
        audio_bytes = await file.read()
        
        whisper_log(f"[Whisper] Transcribing {len(audio_bytes)} bytes, language: {language}")
        
        # Write to temporary file (faster-whisper requires file path)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        
        try:
            # Transcribe with faster-whisper
            segments, info = whisper_model.transcribe(
                tmp_path,
                language=language if language != "auto" else None,
                temperature=temperature,
                beam_size=5,
                vad_filter=True,  # Voice activity detection
                vad_parameters=dict(min_silence_duration_ms=500)
            )
            
            # Collect all segments without logging raw text (avoids console encoding failures).
            segment_texts = []
            segment_count = 0
            for segment in segments:
                segment_count += 1
                cleaned = segment.text.strip()
                if cleaned:
                    segment_texts.append(cleaned)

            text = " ".join(segment_texts)
            whisper_log(f"[Whisper] Transcription complete: {len(text)} chars across {segment_count} segments")
            
            return JSONResponse({"text": text})
            
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except:
                pass
                
    except Exception as e:
        whisper_log(f"[Whisper] Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "model": model_name,
        "device": "cuda" if whisper_model and hasattr(whisper_model, "model") else "cpu"
    }

if __name__ == "__main__":
    whisper_log("="*60)
    whisper_log("Starting Faster Whisper STT Server")
    whisper_log("="*60)
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=9881,
        log_level="info"
    )
