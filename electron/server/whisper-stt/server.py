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

def load_model(model_name_str="tiny.en", device="cuda", compute_type="float16"):
    """Load faster-whisper model with GPU support"""
    global whisper_model, model_name
    
    try:
        from faster_whisper import WhisperModel
        
        print(f"[Whisper] Loading model: {model_name_str} on {device} with {compute_type}")
        
        # Try CUDA first, fall back to CPU
        try:
            whisper_model = WhisperModel(
                model_name_str, 
                device=device,
                compute_type=compute_type,
                download_root=str(Path(__file__).parent / "models")
            )
            model_name = model_name_str
            print(f"[Whisper] Model loaded successfully on {device}")
        except Exception as e:
            print(f"[Whisper] GPU failed, falling back to CPU: {e}")
            whisper_model = WhisperModel(
                model_name_str,
                device="cpu",
                compute_type="int8",
                download_root=str(Path(__file__).parent / "models")
            )
            model_name = model_name_str
            print(f"[Whisper] Model loaded on CPU")
            
    except ImportError:
        print("[Whisper] ERROR: faster-whisper not installed")
        raise
    except Exception as e:
        print(f"[Whisper] ERROR loading model: {e}")
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
            print("[Whisper] CUDA not available, using CPU")
            device = "cpu"
            compute_type = "int8"
        else:
            print(f"[Whisper] CUDA available: {torch.cuda.get_device_name(0)}")
    except:
        print("[Whisper] PyTorch not available, using CPU")
        device = "cpu"
        compute_type = "int8"
    
    # Load tiny.en model by default (fast, English-only)
    load_model("tiny.en", device=device, compute_type=compute_type)

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
        # Read audio data
        audio_bytes = await file.read()
        
        print(f"[Whisper] Transcribing {len(audio_bytes)} bytes, language: {language}")
        
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
            
            # Collect all segments
            text = " ".join([segment.text.strip() for segment in segments])
            
            print(f"[Whisper] Transcription: {text[:100]}...")
            
            return JSONResponse({"text": text})
            
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except:
                pass
                
    except Exception as e:
        print(f"[Whisper] Transcription error: {e}")
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
    print("="*60)
    print("Starting Faster Whisper STT Server")
    print("="*60)
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=9881,
        log_level="info"
    )
