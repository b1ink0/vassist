"""
GPT-SoVITS TTS API Server
FastAPI server for zero-shot and fine-tuned voice synthesis
Runs on http://127.0.0.1:9880
"""

import os
import sys
import io

# Force jieba to use pure Python mode (embedded Python doesn't have C extensions)
class _DummyJiebaModule:
    """Dummy module to prevent jieba C extension import errors"""
    pass
sys.modules['_jieba_fast_functions_py3'] = _DummyJiebaModule()

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import logging
import time
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, File, UploadFile, Form, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import soundfile as sf
import io
import base64
import tempfile

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Directories
BASE_DIR = Path(os.environ.get("GPTSOVITS_DATA_DIR", str(Path(__file__).parent)))
MODELS_DIR = BASE_DIR / "models"
CHECKPOINTS_DIR = BASE_DIR / "checkpoints"
TEMP_DIR = Path(tempfile.gettempdir()) / "gptsovits"
TEMP_DIR.mkdir(exist_ok=True)

# Add GPT-SoVITS source to Python path
GPTSOVITS_DIR = BASE_DIR / "GPT-SoVITS"
if GPTSOVITS_DIR.exists():
    # Change working directory to GPT-SoVITS for relative imports to work
    original_cwd = os.getcwd()
    os.chdir(str(GPTSOVITS_DIR))
    # Add both the repo root (for GPT_SoVITS imports) and the GPT_SoVITS subfolder (for direct imports)
    sys.path.insert(0, str(GPTSOVITS_DIR))
    sys.path.insert(0, str(GPTSOVITS_DIR / "GPT_SoVITS"))
    logger.info(f"Changed working directory to: {GPTSOVITS_DIR}")
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
MODELS_DIR = BASE_DIR / "models"
CHECKPOINTS_DIR = BASE_DIR / "checkpoints"
TEMP_DIR = BASE_DIR / "temp"

# Create directories
MODELS_DIR.mkdir(parents=True, exist_ok=True)
CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Language mapping for GPT-SoVITS webui module
# i18n("英文") returns "English", i18n("中文") returns "Chinese", etc.
dict_language = {
    "中文": "all_zh",
    "英文": "en",
    "日文": "all_ja",
    "中英混合": "zh",
    "日英混合": "ja",
    "多语种混合": "auto",
    "all_zh": "all_zh",
    "en": "en",
    "all_ja": "all_ja",
    "zh": "zh",
    "ja": "ja",
    "auto": "auto",
    "Chinese": "all_zh",
    "English": "en",
    "Japanese": "all_ja",
    "Cantonese": "all_yue",
    "Korean": "all_ko",
}

# Global model variables
vq_model = None
hps = None
t2s_model = None
config = None
hz = 50
max_sec = None
is_half = False
device = "cpu"
bert_model = None
ssl_model = None
tokenizer = None
webui_module = None 

models_loaded = False


def _disable_transformers_torchvision_path():
    """Avoid torchvision imports from transformers on ROCm Windows inference.

    transformers.image_utils conditionally imports torchvision when it thinks the
    package is available. That import chain can pull in torch distributed/FSDP
    internals that are not fully available in this ROCm wheel layout. GPT-SoVITS
    text/audio inference here does not require torchvision, so force-disable it.
    """
    try:
        import transformers.utils.import_utils as hf_import_utils
        hf_import_utils._torchvision_available = False
    except Exception:
        # If transformers internals change, continue without failing startup.
        pass


def _disable_transformers_fsdp_path():
    """Disable transformers FSDP checks for local inference.

    HuBERT forward calls transformers.integrations.fsdp.is_fsdp_managed_module(),
    which imports torch.distributed.fsdp. On this ROCm Windows wheel layout,
    distributed internals are incomplete and that import fails. GPT-SoVITS
    inference here is single-process and does not use FSDP, so force the check
    to always return False.
    """
    try:
        import transformers.integrations.fsdp as hf_fsdp
        hf_fsdp.is_fsdp_managed_module = lambda module: False
    except Exception:
        # If transformers internals change, continue without failing startup.
        pass


def _is_rocm_torch(torch_module):
    """Return True when running on a ROCm/HIP build of torch."""
    try:
        return bool(getattr(torch_module.version, "hip", None))
    except Exception:
        return False

def load_models():
    """Load GPT-SoVITS models using the same approach as reference api.py"""
    global models_loaded, vq_model, hps, t2s_model, config, hz, max_sec
    global bert_model, ssl_model, tokenizer, is_half, device
    
    if models_loaded:
        logger.info("Models already loaded")
        return
    
    try:
        # Model paths - s1 = GPT (text-to-semantic), s2G = SoVITS (vocoder),
        s1_model = MODELS_DIR / "s1v3.ckpt"  # GPT model for text-to-semantic
        s2G_model = MODELS_DIR / "v2Pro" / "s2Gv2ProPlus.pth"  # SoVITS vocoder
        bert_path = MODELS_DIR / "chinese-roberta-wwm-ext-large"
        hubert_path = MODELS_DIR / "chinese-hubert-base"
        
        
        # Set up paths for GPT-SoVITS
        os.environ["bert_path"] = str(bert_path)
        os.environ["cnhubert_base_path"] = str(hubert_path)
        os.environ["gpt_path"] = str(s1_model)  # GPT uses s1 model
        os.environ["sovits_path"] = str(s2G_model)  # SoVITS uses s2G model
        os.environ["_GPTSOVITS_INFER"] = "1"  # Skip auto-load
        os.environ["is_share"] = "False"  # Disable speaker verification
        sv_path = MODELS_DIR / "sv" / "pretrained_eres2netv2w24s4ep4.ckpt"
        os.environ["sv_path"] = str(sv_path)
        
        # Change to GPT-SoVITS directory for imports
        original_dir = os.getcwd()
        gpt_sovits_dir = GPTSOVITS_DIR
        os.chdir(gpt_sovits_dir)
        sys.path.insert(0, str(gpt_sovits_dir))
        sys.path.insert(0, str(gpt_sovits_dir / "GPT_SoVITS"))
        
        logger.info("Importing GPT-SoVITS modules...")
        _disable_transformers_torchvision_path()
        _disable_transformers_fsdp_path()
        
        import torch

        # Decide precision BEFORE importing inference_webui, because that module
        # reads os.environ["is_half"] at import time and instantiates HuBERT/BERT.
        device = "cuda" if torch.cuda.is_available() else "cpu"
        is_rocm = device == "cuda" and _is_rocm_torch(torch)
        is_half = torch.cuda.is_available() and not is_rocm
        os.environ["is_half"] = "True" if is_half else "False"

        if is_rocm:
            # Keep ROCm stable by default; optional benchmark mode can be enabled
            # explicitly for testing via GPTSOVITS_ROCM_BENCHMARK=1.
            torch.backends.cudnn.benchmark = os.environ.get("GPTSOVITS_ROCM_BENCHMARK", "0") == "1"
            torch.backends.cudnn.deterministic = False
            # MIOpen fallback with zero workspace can heavily stall vocoder decode.
            # Disable cudnn/MIOpen backend by default on ROCm and use native HIP kernels.
            torch.backends.cudnn.enabled = os.environ.get("GPTSOVITS_ROCM_CUDNN", "0") == "1"

        import numpy as np
        from transformers import AutoModelForMaskedLM, AutoTokenizer
        from feature_extractor import cnhubert
        from module.models import SynthesizerTrn
        from AR.models.t2s_lightning_module import Text2SemanticLightningModule
        from text import cleaned_text_to_sequence
        from text.cleaner import clean_text
        from module.mel_processing import spectrogram_torch
        from tools.my_utils import load_audio
        
        # Import the get_tts_wav function and helper functions
        import GPT_SoVITS.inference_webui as webui_mod
        globals()['webui_module'] = webui_mod  # Store globally for get_tts_wav
        
        # Set global device - properly update global variables
        globals()['device'] = device
        globals()['is_half'] = is_half
        webui_mod.device = device
        webui_mod.is_half = is_half
        logger.info(
            "Using device: %s, half precision: %s, rocm: %s, cudnn.enabled: %s, cudnn.benchmark: %s",
            device,
            is_half,
            is_rocm,
            torch.backends.cudnn.enabled,
            torch.backends.cudnn.benchmark,
        )
        
        # Initialize BERT and HuBERT models
        cnhubert.cnhubert_base_path = str(hubert_path)
        tokenizer = AutoTokenizer.from_pretrained(str(bert_path))
        bert_model = AutoModelForMaskedLM.from_pretrained(str(bert_path))
        ssl_model = cnhubert.get_model()
        
        if is_half:
            bert_model = bert_model.half().to(device)
            ssl_model = ssl_model.half().to(device)
        else:
            bert_model = bert_model.to(device)
            ssl_model = ssl_model.to(device)

        # Keep inference_webui globals in sync with the chosen precision/device.
        try:
            if hasattr(webui_mod, 'bert_model') and webui_mod.bert_model is not None:
                webui_mod.bert_model = (webui_mod.bert_model.half() if is_half else webui_mod.bert_model.float()).to(device)
            if hasattr(webui_mod, 'ssl_model') and webui_mod.ssl_model is not None:
                webui_mod.ssl_model = (webui_mod.ssl_model.half() if is_half else webui_mod.ssl_model.float()).to(device)
        except Exception as sync_err:
            logger.warning(f"Precision sync warning: {sync_err}")
        
        # Load SoVITS first
        webui_mod.change_sovits_weights(str(s2G_model))
        
        # Load GPT model - use default config from GPT-SoVITS
        dict_s1 = torch.load(str(s1_model), map_location="cpu", weights_only=False)
        gpt_config = dict_s1.get("config", {})
        
        # Default config from GPT-SoVITS - ALL required keys from t2s_model.py
        default_model_config = {
            "hidden_dim": 512,
            "embedding_dim": 512,
            "head": 8,
            "n_layer": 12,
            "dropout": 0.0,
            "vocab_size": 1024 + 1,
            "phoneme_vocab_size": 512,
            "EOS": 1024,
        }
        
        default_data_config = {
            "max_sec": 54,
            "sampling_rate": 32000,
        }
        
        # Merge defaults with checkpoint config
        if "model" not in gpt_config:
            gpt_config["model"] = {}
        if "data" not in gpt_config:
            gpt_config["data"] = {}
            
        for key, value in default_model_config.items():
            if key not in gpt_config["model"]:
                gpt_config["model"][key] = value
                
        for key, value in default_data_config.items():
            if key not in gpt_config["data"]:
                gpt_config["data"][key] = value
        
        # Load model with merged config
        from AR.models.t2s_lightning_module import Text2SemanticLightningModule
        
        # Set module variables including device settings
        webui_mod.device = device
        webui_mod.is_half = is_half
        webui_mod.hz = 50
        webui_mod.max_sec = gpt_config["data"]["max_sec"]
        webui_mod.config = gpt_config
        
        # Create and load model
        webui_mod.t2s_model = Text2SemanticLightningModule(gpt_config, "****", is_train=False)
        webui_mod.t2s_model.load_state_dict(dict_s1["weight"])
        webui_mod.t2s_model.eval()
        
        if is_half:
            webui_mod.t2s_model = webui_mod.t2s_model.half()
        webui_mod.t2s_model = webui_mod.t2s_model.to(device)
        
        del dict_s1
        logger.info("✓ GPT model loaded successfully")
        
        # Get the model references from the module
        vq_model = webui_mod.vq_model
        hps = webui_mod.hps
        t2s_model = webui_mod.t2s_model
        config = webui_mod.config
        hz = webui_mod.hz
        max_sec = webui_mod.max_sec
        
        # Change back to original directory
        os.chdir(original_dir)
        
        # Mark models as loaded (update global variable)
        globals()['models_loaded'] = True
        logger.info("✓ Models loaded successfully and ready for inference")
        
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        import traceback
        traceback.print_exc()

def get_tts_wav(ref_wav_path, prompt_text, prompt_language, text, text_language):
    """
    Generate TTS audio using GPT-SoVITS (generator function)
    Calls the actual GPT-SoVITS inference_webui.get_tts_wav
    """
    if webui_module is None:
        raise RuntimeError("Models not loaded. Call load_models() first.")
    
    # Map language codes to what webui expects
    # "en" → needs to become "English" (what i18n("英文") returns)
    lang_to_i18n = {
        "en": "English",
        "zh": "Chinese",  
        "ja": "Japanese",
        "all_zh": "Chinese",
        "all_ja": "Japanese",
        "auto": "Mixed (Multilingual)",
    }
    
    # Convert to i18n format that webui's dict_language expects
    prompt_lang = lang_to_i18n.get(prompt_language, prompt_language)
    text_lang = lang_to_i18n.get(text_language, text_language)
    
    # Timing diagnostics: measure where the request spends time.
    started_at = time.perf_counter()
    chunks_emitted = 0

    # Call the webui module's get_tts_wav function
    for sample_rate, audio_data in webui_module.get_tts_wav(
        ref_wav_path, prompt_text, prompt_lang, text, text_lang
    ):
        chunks_emitted += 1

        # Convert numpy array to WAV bytes
        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, audio_data, sample_rate, format='WAV')
        wav_buffer.seek(0)
        yield wav_buffer.read()

    finished_at = time.perf_counter()
    logger.info(
        "TTS timing: completed in %.3fs (chunks=%d)",
        finished_at - started_at,
        chunks_emitted,
    )

# In-memory reference cache
reference_cache = {}

@app.on_event("startup")
async def startup_event():
    """Initialize models on server startup"""
    logger.info("=" * 60)
    logger.info("Starting GPT-SoVITS TTS Server...")
    logger.info("=" * 60)
    load_models()
    logger.info("Server ready for TTS requests")
    logger.info("=" * 60)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "GPT-SoVITS TTS",
        "version": "1.0.0",
        "models_loaded": models_loaded
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "gpu_available": check_gpu(),
        "models": {
            "gpt": (MODELS_DIR / "v2Pro" / "s2Gv2ProPlus.pth").exists(),
            "sovits": (MODELS_DIR / "v2Pro" / "s2Dv2ProPlus.pth").exists()
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
                "timestamp": time.time()
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
        
        # Check if models are loaded
        if not models_loaded:
            logger.warning("Models not loaded, attempting to load...")
            load_models()
            if not models_loaded:
                raise HTTPException(
                    status_code=503,
                    detail="Models not loaded. Check server logs and model files."
                )
        
        logger.info("Models loaded, generating TTS...")
        
        # Map language codes through dict_language
        prompt_language = dict_language.get(language, language)
        text_language = dict_language.get(language, language)
        
        # Primary reference
        ref_wav_path = ref_paths[0]
        prompt_text = ref_texts[0] if ref_texts else ""
        
        logger.info(f"Running TTS: text='{text[:50]}...', ref={ref_wav_path}, lang={text_language}")
        
        # Return streaming audio response using generator
        try:
            return StreamingResponse(
                get_tts_wav(ref_wav_path, prompt_text, prompt_language, text, text_language),
                media_type="audio/wav"
            )
        except Exception as e:
            logger.error(f"TTS generation failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"TTS failed: {str(e)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class TTSRequestJSON(BaseModel):
    """JSON format (from request.json)"""
    input: str
    reference_audio: str
    reference_text: str
    reference_language: str = "en"
    voice: Optional[str] = None


@app.post("/tts")
async def text_to_speech(request: Request):
    """
    Generate speech from text using reference audio
    
    Accepts BOTH:
    1. Form Data (multipart/form-data): text, ref_audio_base64, ref_text, language
    2. JSON Body (application/json): input, reference_audio, reference_text, reference_language
    """
    
    if not models_loaded:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    try:
        content_type = request.headers.get("content-type", "")
        
        if "application/json" in content_type:
            # JSON format
            data = await request.json()
            text_val = data.get("input")
            ref_audio_b64 = data.get("reference_audio")
            ref_text_val = data.get("reference_text")
            language_val = data.get("reference_language", "en")
        else:
            # Form data format
            form = await request.form()
            text_val = form.get("text")
            ref_audio_b64 = form.get("ref_audio_base64")
            ref_text_val = form.get("ref_text")
            language_val = form.get("language", "en")
        
        if not text_val:
            raise HTTPException(status_code=400, detail="text/input field is required")
        
        if not ref_audio_b64:
            raise HTTPException(status_code=400, detail="ref_audio_base64/reference_audio field is required")
        
        if not ref_text_val:
            raise HTTPException(status_code=400, detail="ref_text/reference_text field is required")
        
        # Decode base64 reference audio
        try:
            audio_data = base64.b64decode(ref_audio_b64)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid base64 audio data: {e}")
        
        # Save to temporary file
        temp_audio_path = TEMP_DIR / f"ref_{int(time.time() * 1000)}.wav"
        temp_audio_path.write_bytes(audio_data)
        
        # Pass language codes directly
        prompt_language = language_val.lower()
        text_language = language_val.lower()
        
        logger.info(f"Generating speech: '{text_val[:50]}...' (lang={language_val})")
        
        # Return streaming response
        response = StreamingResponse(
            get_tts_wav(str(temp_audio_path), ref_text_val, prompt_language, text_val, text_language),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=output.wav"}
        )
        
        return response
        
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
