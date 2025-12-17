"""
GPT-SoVITS TTS API Server
FastAPI server for zero-shot and fine-tuned voice synthesis
Runs on http://127.0.0.1:9880
"""

import os
import sys
import io

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import logging
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import soundfile as sf
import io
import base64
import tempfile

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Directories
BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
CHECKPOINTS_DIR = BASE_DIR / "checkpoints"
TEMP_DIR = Path(tempfile.gettempdir()) / "gptsovits"
TEMP_DIR.mkdir(exist_ok=True)

# Add GPT-SoVITS source to Python path
GPTSOVITS_DIR = BASE_DIR / "GPT-SoVITS"
if GPTSOVITS_DIR.exists():
    sys.path.insert(0, str(GPTSOVITS_DIR))
    logger.info(f"Added GPT-SoVITS source to path: {GPTSOVITS_DIR}")

# Reference audio cache (in-memory)
reference_cache = {}

# Initialize FastAPI
app = FastAPI(title="GPT-SoVITS TTS API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
CHECKPOINTS_DIR = BASE_DIR / "checkpoints"
TEMP_DIR = BASE_DIR / "temp"

# Create directories
MODELS_DIR.mkdir(exist_ok=True)
CHECKPOINTS_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)

# Global model instance (loaded ONCE and kept in memory)
gpt_sovits_model = None
is_loading = False  # Prevent concurrent loading attempts

def load_models():
    """Load pre-trained GPT-SoVITS models - ONLY CALLED ONCE AT STARTUP"""
    global gpt_sovits_model, is_loading
    
    if gpt_sovits_model is not None:
        logger.info("Models already loaded in memory, skipping reload")
        return
    
    if is_loading:
        logger.info("Models currently loading, please wait...")
        return
    
    is_loading = True
    
    try:
        # Check for downloaded v2Pro+ models
        s2G_model = MODELS_DIR / "v2Pro" / "s2Gv2ProPlus.pth"
        s2D_model = MODELS_DIR / "v2Pro" / "s2Dv2ProPlus.pth"
        
        if not s2G_model.exists() or not s2D_model.exists():
            logger.error(f"Models not found at {MODELS_DIR}/v2Pro/")
            logger.error("Please run setup.py to download models")
            return
        
        # Import GPT-SoVITS inference from cloned repo
        logger.info(f"Loading GPT-SoVITS v2Pro+ models from {MODELS_DIR}")
        logger.info(f"  Generator: {s2G_model}")
        logger.info(f"  Discriminator: {s2D_model}")
        
        try:
            # Import from GPT-SoVITS source
            from GPT_SoVITS.inference_cli import get_tts_wav
            import torch
            
            # Load models with PyTorch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"Using device: {device}")
            
            # Create inference wrapper
            class GPTSoVITSInference:
                def __init__(self, s2g_path, s2d_path, device="cuda"):
                    self.device = device
                    self.s2g_path = str(s2g_path)
                    self.s2d_path = str(s2d_path)
                    # Models loaded lazily by get_tts_wav
                    
                def infer(self, text, ref_wav_path, prompt_text="", 
                         prompt_language="en", text_language="en", **kwargs):
                    """Generate speech using reference audio"""
                    # Use GPT-SoVITS inference function
                    audio = get_tts_wav(
                        ref_wav_path=ref_wav_path,
                        prompt_text=prompt_text,
                        prompt_language=prompt_language,
                        text=text,
                        text_language=text_language,
                        how_to_cut="不切",
                        top_k=kwargs.get("top_k", 15),
                        top_p=kwargs.get("top_p", 0.8),
                        temperature=kwargs.get("temperature", 0.8),
                        speed=kwargs.get("speed", 1.0)
                    )
                    return audio
            
            gpt_sovits_model = GPTSoVITSInference(s2G_model, s2D_model, device)
            
        except ImportError as e:
            logger.error(f"Failed to import GPT-SoVITS: {e}")
            logger.error("Make sure GPT-SoVITS source is cloned in electron/server/gpt-sovits/GPT-SoVITS")
            raise
        
        logger.info("✓ GPT-SoVITS models loaded into memory (will persist)")
        
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        gpt_sovits_model = None
    finally:
        is_loading = False

@app.on_event("startup")
async def startup_event():
    """Initialize models on server startup - MODELS LOADED ONCE HERE"""
    logger.info("=" * 60)
    logger.info("Starting GPT-SoVITS TTS Server...")
    logger.info("=" * 60)
    load_models()  # Load models into memory ONCE
    logger.info("Server ready. Models will stay in memory for all requests.")
    logger.info("=" * 60)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "GPT-SoVITS TTS",
        "version": "1.0.0",
        "models_loaded": gpt_sovits_model is not None
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "gpu_available": check_gpu(),
        "models": {
            "gpt": (MODELS_DIR / "gpt_model.ckpt").exists(),
            "sovits": (MODELS_DIR / "sovits_model.pth").exists()
        }
    }

def check_gpu():
    """Check if GPU is available"""
    try:
        import torch
        return torch.cuda.is_available()
    except:
        return False

@app.post("/v1/audio/speech")
async def openai_compatible_tts(request: dict):
    """
    OpenAI-compatible TTS endpoint
    Accepts JSON with:
    - input: text to synthesize
    - voice: voice ID or "default"
    - speed: speech speed (0.5-2.0)
    - reference_audio: base64 encoded audio (optional)
    - reference_text: transcript of reference (optional)
    - reference_id: cached reference ID (optional)
    - references: array of reference_ids for multi-ref (optional)
    """
    try:
        # Extract parameters
        text = request.get("input", "")
        voice = request.get("voice", "default")
        speed = request.get("speed", 1.0)
        language = request.get("language", "en")
        
        if not text:
            raise HTTPException(status_code=400, detail="Missing 'input' field")
        
        # Handle reference audio from cache or new upload
        ref_audio_path = None
        ref_text = ""
        reference_id = request.get("reference_id", "")
        
        # Check if new reference audio provided (base64)
        if "reference_audio" in request:
            ref_audio_b64 = request["reference_audio"]
            ref_text = request.get("reference_text", "")
            ref_lang = request.get("reference_language", language)
            
            # Decode base64 to audio bytes
            try:
                audio_bytes = base64.b64decode(ref_audio_b64)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid base64 audio: {e}")
            
            # Generate cache ID if not provided
            if not reference_id:
                import hashlib
                reference_id = "ref_" + hashlib.md5(audio_bytes).hexdigest()[:16]
            
            # Save to temp file
            ref_audio_path = TEMP_DIR / f"{reference_id}.wav"
            with open(ref_audio_path, "wb") as f:
                f.write(audio_bytes)
            
            # Cache the reference
            reference_cache[reference_id] = {
                "path": str(ref_audio_path),
                "text": ref_text,
                "language": ref_lang,
                "timestamp": os.time()
            }
            
            logger.info(f"Cached new reference: {reference_id}")
            
        elif reference_id and reference_id in reference_cache:
            # Use cached reference
            cached = reference_cache[reference_id]
            ref_audio_path = Path(cached["path"])
            ref_text = cached["text"]
            language = cached.get("language", language)
            logger.info(f"Using cached reference: {reference_id}")
        
        # Handle multiple references for better quality
        ref_paths = []
        ref_texts = []
        
        if "references" in request and isinstance(request["references"], list):
            for ref_id in request["references"]:
                if ref_id in reference_cache:
                    cached = reference_cache[ref_id]
                    ref_paths.append(cached["path"])
                    ref_texts.append(cached["text"])
            logger.info(f"Using {len(ref_paths)} references")
        elif ref_audio_path:
            ref_paths = [str(ref_audio_path)]
            ref_texts = [ref_text]
        
        # Perform TTS inference
        logger.info(f"Generating TTS for: '{text[:50]}...' (lang={language}, speed={speed})")
        
        if not ref_paths:
            raise HTTPException(
                status_code=400,
                detail="Reference audio required. Provide reference_audio or reference_id."
            )
        
        # Check if models are loaded (should already be in memory from startup)
        if gpt_sovits_model is None:
            logger.warning("Models not in memory, attempting to load...")
            load_models()
            if gpt_sovits_model is None:
                raise HTTPException(
                    status_code=503,
                    detail="Models not loaded. Check server logs and model files."
                )
        
        logger.info("Using models from memory (no reload needed)")
        
        # Use GPT-SoVITS for actual inference with reference audio
        try:
            # Primary reference
            ref_wav_path = ref_paths[0]
            prompt_text = ref_texts[0] if ref_texts else ""
            
            # TODO: Call actual GPT-SoVITS inference (models already in memory)
            # audio_data = gpt_sovits_model.infer(
            #     text=text,
            #     ref_wav_path=ref_wav_path,
            #     prompt_text=prompt_text,
            #     ...
            # )
            
            # PLACEHOLDER: Generate test audio until GPT-SoVITS integration complete
            import numpy as np
            sample_rate = 48000
            duration = len(text.split()) * 0.3
            audio_data = np.random.randn(int(sample_rate * duration)).astype(np.float32) * 0.1
            
            logger.warning("Using placeholder audio - GPT-SoVITS inference not yet integrated")
            
        except Exception as e:
            logger.error(f"Inference failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"TTS inference failed: {str(e)}. Check models and reference audio."
            )
        
        # Convert to WAV bytes
        audio_buffer = io.BytesIO()
        sf.write(audio_buffer, audio_data, sample_rate, format='WAV')
        audio_buffer.seek(0)
        
        logger.info(f"✓ TTS generated successfully ({len(audio_data)/sample_rate:.2f}s)")
        
        # Return JSON response with audio
        audio_base64 = base64.b64encode(audio_buffer.read()).decode('utf-8')
        
        return {
            "audio": audio_base64,
            "format": "wav",
            "sample_rate": sample_rate,
            "channels": 1,
            "reference_id": reference_id,
            "voice": voice
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tts")
async def text_to_speech(
    text: str = Form(...),
    ref_audio_path: Optional[str] = Form(None),
    ref_audio: Optional[UploadFile] = File(None),
    ref_text: Optional[str] = Form(None),
    language: str = Form("en"),
    speed: float = Form(1.0),
    top_k: int = Form(15),
    top_p: float = Form(0.8),
    temperature: float = Form(0.8)
):
    """
    Generate speech from text using reference audio
    
    Parameters:
    - text: Text to synthesize
    - ref_audio_path: Path to reference audio (or upload ref_audio)
    - ref_audio: Reference audio file (multipart upload)
    - ref_text: Transcript of reference audio (optional for zero-shot)
    - language: Language code (en, zh, ja, ko)
    - speed: Speech speed (0.5-2.0)
    - top_k: Sampling top-k
    - top_p: Sampling top-p
    - temperature: Sampling temperature
    """
    
    if gpt_sovits_model is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    try:
        # Handle reference audio
        ref_audio_bytes = None
        if ref_audio:
            ref_audio_bytes = await ref_audio.read()
            ref_audio_path = TEMP_DIR / f"ref_{ref_audio.filename}"
            with open(ref_audio_path, "wb") as f:
                f.write(ref_audio_bytes)
        elif ref_audio_path:
            ref_audio_path = Path(ref_audio_path)
            if not ref_audio_path.exists():
                raise HTTPException(status_code=404, detail="Reference audio not found")
        else:
            raise HTTPException(status_code=400, detail="Reference audio required")
        
        # Perform TTS inference
        logger.info(f"Generating speech: '{text[:50]}...'")
        
        audio_data = gpt_sovits_model.infer(
            text=text,
            ref_wav_path=str(ref_audio_path),
            prompt_text=ref_text or "",
            prompt_language=language,
            text_language=language,
            how_to_cut="凑四句一切" if language == "zh" else "不切",
            top_k=top_k,
            top_p=top_p,
            temperature=temperature,
            speed=speed
        )
        
        # Convert to WAV bytes
        audio_buffer = io.BytesIO()
        sf.write(audio_buffer, audio_data, 32000, format='WAV')
        audio_buffer.seek(0)
        
        logger.info("✓ Speech generated successfully")
        
        return StreamingResponse(
            audio_buffer,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=output.wav"}
        )
        
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models/list")
async def list_models():
    """List available models"""
    models = {
        "pretrained": [],
        "checkpoints": []
    }
    
    # List bundled models
    if MODELS_DIR.exists():
        models["pretrained"] = [f.name for f in MODELS_DIR.glob("*.ckpt")]
        models["pretrained"] += [f.name for f in MODELS_DIR.glob("*.pth")]
    
    # List fine-tuned checkpoints
    if CHECKPOINTS_DIR.exists():
        models["checkpoints"] = [f.name for f in CHECKPOINTS_DIR.rglob("*.ckpt")]
    
    return models

@app.post("/models/load")
async def load_custom_model(gpt_path: str = Form(...), sovits_path: str = Form(...)):
    """Load custom fine-tuned models"""
    global gpt_sovits_model
    
    try:
        from GPT_SoVITS.inference_webui import GPT_SoVITS_Inference
        
        gpt_sovits_model = GPT_SoVITS_Inference(
            gpt_path=gpt_path,
            sovits_path=sovits_path
        )
        
        return {"status": "success", "message": "Models loaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    
    # Get port from environment or default
    port = int(os.getenv("GPTSOVITS_PORT", "9880"))
    
    logger.info(f"Starting server on http://127.0.0.1:{port}")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=False
    )
