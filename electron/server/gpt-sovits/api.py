"""
GPT-SoVITS TTS API Server
FastAPI server for zero-shot and fine-tuned voice synthesis
Runs on http://127.0.0.1:9880
"""

import os
import sys
import io
import types
import gc

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
from contextlib import nullcontext
from functools import wraps
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
is_rocm = False
use_rocm_mixed_precision = False
rocm_weight_dtype_name = "float32"
rocm_autocast_dtype_name = "float16"
rocm_weight_policy_name = "balanced"

models_loaded = False


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _rocm_autocast_context():
    if use_rocm_mixed_precision and device == "cuda":
        import torch

        return torch.autocast(
            device_type="cuda",
            dtype=_get_rocm_dtype(torch, rocm_autocast_dtype_name, torch.float16),
        )
    return nullcontext()


def _get_rocm_dtype(torch_module, dtype_name: str, default_dtype):
    normalized = str(dtype_name or "").strip().lower()
    mapping = {
        "float16": torch_module.float16,
        "fp16": torch_module.float16,
        "half": torch_module.float16,
        "bfloat16": torch_module.bfloat16,
        "bf16": torch_module.bfloat16,
        "float32": torch_module.float32,
        "fp32": torch_module.float32,
        "full": torch_module.float32,
    }
    return mapping.get(normalized, default_dtype)


def _cast_module_precision(module_obj, dtype):
    if module_obj is None or dtype is None:
        return module_obj
    if not hasattr(module_obj, "to"):
        return module_obj
    try:
        return module_obj.to(device=device, dtype=dtype)
    except TypeError:
        return module_obj.to(dtype=dtype).to(device)
    except Exception:
        return module_obj


def _cast_named_module(owner, attr_name: str, dtype):
    if owner is None or not hasattr(owner, attr_name):
        return
    module_obj = getattr(owner, attr_name, None)
    if module_obj is None:
        return
    setattr(owner, attr_name, _cast_module_precision(module_obj, dtype))


def _clear_gpu_cache():
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            if hasattr(torch.cuda, "ipc_collect"):
                torch.cuda.ipc_collect()
    except Exception:
        pass


def _clear_backend_workspaces():
    try:
        import torch

        clear_fn = getattr(getattr(torch, "_C", None), "_cuda_clearCublasWorkspaces", None)
        if callable(clear_fn):
            clear_fn()
    except Exception:
        pass


def _log_gpu_memory(stage: str):
    try:
        import torch

        if device != "cuda" or not torch.cuda.is_available():
            return

        allocated_gb = torch.cuda.memory_allocated() / (1024 ** 3)
        reserved_gb = torch.cuda.memory_reserved() / (1024 ** 3)
        max_allocated_gb = torch.cuda.max_memory_allocated() / (1024 ** 3)
        logger.info(
            "GPU memory %s: allocated=%.2fGB reserved=%.2fGB peak_allocated=%.2fGB",
            stage,
            allocated_gb,
            reserved_gb,
            max_allocated_gb,
        )
    except Exception:
        pass


def _get_cut_option_label(option: str):
    if webui_module is None:
        return option

    labels = {
        "none": "不切",
        "4-sentences": "凑四句一切",
        "50-chars": "凑50字一切",
        "zh-period": "按中文句号。切",
        "en-period": "按英文句号.切",
        "punctuation": "按标点符号切",
    }
    source_text = labels.get(option, labels["punctuation"])
    i18n_fn = getattr(webui_module, "i18n", None)
    if callable(i18n_fn):
        try:
            return i18n_fn(source_text)
        except Exception:
            return source_text
    return source_text


def _resolve_cut_strategy(text: str, requested_strategy: Optional[str] = None):
    strategy = str(
        requested_strategy
        or os.environ.get("GPTSOVITS_API_CUT_STRATEGY", "auto")
    ).strip().lower()

    if strategy and strategy != "auto":
        return _get_cut_option_label(strategy)

    threshold_raw = os.environ.get("GPTSOVITS_API_CUT_THRESHOLD", "120").strip()
    try:
        threshold = max(1, int(threshold_raw))
    except ValueError:
        threshold = 120

    if len(text) <= threshold:
        return _get_cut_option_label("none")

    punctuation_chars = set(",.;:!?，。；：！？、")
    if any(char in punctuation_chars for char in text):
        return _get_cut_option_label("punctuation")

    return _get_cut_option_label("50-chars")


def _clear_request_cache():
    try:
        request_cache = getattr(webui_module, "cache", None)
        if isinstance(request_cache, dict):
            request_cache.clear()
    except Exception as cache_err:
        logger.warning(f"Request cache cleanup warning: {cache_err}")


def _get_chunk_limits(text_language: str):
    lang = str(text_language or "").lower()
    if "ja" in lang or "zh" in lang or "yue" in lang or "ko" in lang:
        return 80, 140
    return 180, 320


def _is_cjk_language(text_language: str):
    lang = str(text_language or "").lower()
    return "ja" in lang or "zh" in lang or "yue" in lang or "ko" in lang


def _split_sentence_units(text: str):
    closers = set("\"')]}」』】）》〕］｝〟〞")
    terminals = set("。！？.!?\n")
    units = []
    buffer = []
    index = 0
    length = len(text)

    while index < length:
        ch = text[index]
        buffer.append(ch)

        if ch in terminals:
            index += 1
            while index < length and text[index] in closers.union({" ", "\t", "\r", "\n"}):
                buffer.append(text[index])
                index += 1
            chunk = "".join(buffer).strip()
            if chunk:
                units.append(chunk)
            buffer = []
            continue

        index += 1

    tail = "".join(buffer).strip()
    if tail:
        units.append(tail)

    return units


def _split_soft_units(text: str):
    closers = set("\"')]}」』】）》〕］｝〟〞")
    separators = set("、，,；;：:\n")
    units = []
    buffer = []
    index = 0
    length = len(text)

    while index < length:
        ch = text[index]
        buffer.append(ch)

        if ch in separators:
            index += 1
            while index < length and text[index] in closers.union({" ", "\t", "\r", "\n"}):
                buffer.append(text[index])
                index += 1
            chunk = "".join(buffer).strip()
            if chunk:
                units.append(chunk)
            buffer = []
            continue

        index += 1

    tail = "".join(buffer).strip()
    if tail:
        units.append(tail)

    return units


def _split_by_length(text: str, hard_limit: int):
    preferred_breaks = set("、，,；;：: 。！？.!? \n")
    chunks = []
    remaining = text.strip()

    while len(remaining) > hard_limit:
        window = remaining[:hard_limit]
        break_at = -1
        for index in range(len(window) - 1, max(0, hard_limit // 2) - 1, -1):
            if window[index] in preferred_breaks:
                break_at = index + 1
                break

        if break_at <= 0:
            break_at = hard_limit

        chunk = remaining[:break_at].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[break_at:].strip()

    if remaining:
        chunks.append(remaining)

    return chunks


def _split_oversized_unit(unit: str, target_chars: int, hard_limit: int):
    stripped = unit.strip()
    if not stripped:
        return []
    if len(stripped) <= hard_limit:
        return [stripped]

    soft_units = _split_soft_units(stripped)
    if len(soft_units) <= 1:
        return _split_by_length(stripped, hard_limit)

    planned = []
    current = ""

    for soft_unit in soft_units:
        candidate = f"{current}{soft_unit}" if current else soft_unit

        if current and len(candidate) > target_chars:
            planned.append(current.strip())
            current = soft_unit
        else:
            current = candidate

    if current.strip():
        planned.append(current.strip())

    expanded = []
    for chunk in planned:
        if len(chunk) > hard_limit:
            expanded.extend(_split_by_length(chunk, hard_limit))
        else:
            expanded.append(chunk)

    return expanded


def _plan_tts_requests(
    text: str,
    text_language: str,
    requested_strategy: Optional[str] = None,
):
    strategy = str(
        requested_strategy
        or os.environ.get("GPTSOVITS_API_CUT_STRATEGY", "auto")
    ).strip().lower()

    if strategy and strategy != "auto":
        return [(text.strip(), strategy)]

    target_chars, hard_limit = _get_chunk_limits(text_language)
    sentence_units = _split_sentence_units(text)
    if not sentence_units:
        stripped = text.strip()
        return [(stripped, "none")] if stripped else []

    units = []
    for sentence_unit in sentence_units:
        units.extend(_split_oversized_unit(sentence_unit, target_chars, hard_limit))

    if _is_cjk_language(text_language):
        planned = units
    else:
        planned = []
        current = ""

        for unit in units:
            candidate = f"{current}{unit}" if current else unit

            if current and len(candidate) > target_chars:
                planned.append(current.strip())
                current = unit
            else:
                current = candidate

        if current.strip():
            planned.append(current.strip())

    requests = []
    for chunk in planned:
        if len(chunk) > hard_limit:
            requests.append((chunk, "50-chars"))
        else:
            requests.append((chunk, "none"))

    return requests


def _apply_rocm_weight_policy(webui_mod):
    if not use_rocm_mixed_precision or device != "cuda":
        return

    try:
        import torch

        target_dtype = _get_rocm_dtype(
            torch,
            rocm_weight_dtype_name,
            torch.float16,
        )

        weight_policy = str(rocm_weight_policy_name or "balanced").strip().lower()
        aggressive = weight_policy == "aggressive"
        core_dtype = target_dtype if target_dtype != torch.float32 else torch.float32
        extended_dtype = target_dtype if aggressive and target_dtype != torch.float32 else torch.float32

        _cast_named_module(webui_mod, "bert_model", core_dtype)
        _cast_named_module(webui_mod, "ssl_model", core_dtype)
        if getattr(webui_mod, "ssl_model", None) is not None:
            _cast_named_module(webui_mod.ssl_model, "model", core_dtype)
        _cast_named_module(webui_mod, "t2s_model", core_dtype)
        _cast_named_module(webui_mod, "vq_model", extended_dtype)
        if getattr(webui_mod, "vq_model", None) is not None:
            _cast_named_module(webui_mod.vq_model, "cfm", extended_dtype)

        if getattr(webui_mod, "sv_cn_model", None) is not None:
            sv_dtype = target_dtype if aggressive else torch.float32
            _cast_named_module(webui_mod.sv_cn_model, "embedding_model", sv_dtype)
            if hasattr(webui_mod.sv_cn_model, "is_half"):
                webui_mod.sv_cn_model.is_half = sv_dtype == torch.float16

        _cast_named_module(webui_mod, "bigvgan_model", extended_dtype)
        _cast_named_module(webui_mod, "hifigan_model", extended_dtype)
        _clear_gpu_cache()
    except Exception as cast_err:
        logger.warning(f"ROCm weight policy warning: {cast_err}")


def _wrap_bound_method_with_autocast(instance, method_name: str):
    original = getattr(instance, method_name, None)
    if original is None or getattr(original, "_gptsovits_rocm_amp_wrapped", False):
        return

    original_func = getattr(original, "__func__", None)
    if original_func is None:
        return

    @wraps(original_func)
    def wrapped(self, *args, **kwargs):
        with _rocm_autocast_context():
            return original_func(self, *args, **kwargs)

    wrapped._gptsovits_rocm_amp_wrapped = True
    setattr(instance, method_name, types.MethodType(wrapped, instance))


def _patch_rocm_mixed_precision_runtime(webui_mod):
    if not use_rocm_mixed_precision:
        return

    try:
        _apply_rocm_weight_policy(webui_mod)

        if getattr(webui_mod, "bert_model", None) is not None:
            _wrap_bound_method_with_autocast(webui_mod.bert_model, "forward")

        if getattr(webui_mod, "ssl_model", None) is not None and getattr(webui_mod.ssl_model, "model", None) is not None:
            _wrap_bound_method_with_autocast(webui_mod.ssl_model.model, "forward")

        if getattr(webui_mod, "t2s_model", None) is not None and getattr(webui_mod.t2s_model, "model", None) is not None:
            _wrap_bound_method_with_autocast(webui_mod.t2s_model.model, "infer_panel")

        if getattr(webui_mod, "vq_model", None) is not None:
            _wrap_bound_method_with_autocast(webui_mod.vq_model, "extract_latent")
            _wrap_bound_method_with_autocast(webui_mod.vq_model, "decode")
            _wrap_bound_method_with_autocast(webui_mod.vq_model, "decode_encp")
            if getattr(webui_mod.vq_model, "cfm", None) is not None:
                _wrap_bound_method_with_autocast(webui_mod.vq_model.cfm, "inference")

        if getattr(webui_mod, "bigvgan_model", None) is not None:
            _wrap_bound_method_with_autocast(webui_mod.bigvgan_model, "forward")

        if getattr(webui_mod, "hifigan_model", None) is not None:
            _wrap_bound_method_with_autocast(webui_mod.hifigan_model, "forward")

        if getattr(webui_mod, "sv_cn_model", None) is not None:
            _wrap_bound_method_with_autocast(webui_mod.sv_cn_model, "compute_embedding3")
    except Exception as patch_err:
        logger.warning(f"ROCm mixed precision patch warning: {patch_err}")


def _install_rocm_mixed_precision_hooks(webui_mod):
    if not use_rocm_mixed_precision:
        return

    if getattr(webui_mod, "_gptsovits_rocm_hooks_installed", False):
        _patch_rocm_mixed_precision_runtime(webui_mod)
        return

    _patch_rocm_mixed_precision_runtime(webui_mod)

    for function_name in ("change_sovits_weights", "change_gpt_weights", "init_bigvgan", "init_hifigan", "init_sv_cn"):
        original = getattr(webui_mod, function_name, None)
        if original is None or getattr(original, "_gptsovits_rocm_hook_wrapped", False):
            continue

        @wraps(original)
        def wrapped(*args, _original=original, **kwargs):
            result = _original(*args, **kwargs)
            _patch_rocm_mixed_precision_runtime(webui_mod)
            return result

        wrapped._gptsovits_rocm_hook_wrapped = True
        setattr(webui_mod, function_name, wrapped)

    webui_mod._gptsovits_rocm_hooks_installed = True


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
    global rocm_weight_dtype_name, rocm_autocast_dtype_name, rocm_weight_policy_name
    
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
        use_rocm_mixed_precision = is_rocm and _env_flag(
            "GPTSOVITS_ROCM_MIXED_PRECISION",
            default=False,
        )
        rocm_weight_dtype_name = os.environ.get(
            "GPTSOVITS_ROCM_WEIGHT_DTYPE",
            "float16",
        ).strip().lower()
        rocm_autocast_dtype_name = os.environ.get(
            "GPTSOVITS_ROCM_AUTOCAST_DTYPE",
            rocm_weight_dtype_name,
        ).strip().lower()
        rocm_weight_policy_name = os.environ.get(
            "GPTSOVITS_ROCM_WEIGHT_POLICY",
            "balanced",
        ).strip().lower()
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
        from module.models import SynthesizerTrn
        from AR.models.t2s_lightning_module import Text2SemanticLightningModule
        from text import cleaned_text_to_sequence
        from text.cleaner import clean_text
        from module.mel_processing import spectrogram_torch
        from tools.my_utils import load_audio
        
        # Import the get_tts_wav function and helper functions
        force_cpu_webui_import = use_rocm_mixed_precision and device == "cuda"
        original_cuda_is_available = None
        if force_cpu_webui_import:
            logger.info(
                "ROCm mixed mode: forcing inference_webui startup load onto CPU before selective GPU transfer"
            )
            original_cuda_is_available = torch.cuda.is_available
            torch.cuda.is_available = lambda: False

        try:
            import GPT_SoVITS.inference_webui as webui_mod
        finally:
            if original_cuda_is_available is not None:
                torch.cuda.is_available = original_cuda_is_available

        globals()['webui_module'] = webui_mod  # Store globally for get_tts_wav
        
        # Set global device - properly update global variables
        globals()['device'] = device
        globals()['is_half'] = is_half
        globals()['is_rocm'] = is_rocm
        globals()['use_rocm_mixed_precision'] = use_rocm_mixed_precision
        globals()['rocm_weight_dtype_name'] = rocm_weight_dtype_name
        globals()['rocm_autocast_dtype_name'] = rocm_autocast_dtype_name
        globals()['rocm_weight_policy_name'] = rocm_weight_policy_name
        webui_mod.device = device
        webui_mod.is_half = is_half
        logger.info(
            "Using device: %s, half precision: %s, rocm: %s, rocm_mixed_precision: %s, rocm_weight_dtype: %s, rocm_autocast_dtype: %s, rocm_weight_policy: %s, cudnn.enabled: %s, cudnn.benchmark: %s",
            device,
            is_half,
            is_rocm,
            use_rocm_mixed_precision,
            rocm_weight_dtype_name,
            rocm_autocast_dtype_name,
            rocm_weight_policy_name,
            torch.backends.cudnn.enabled,
            torch.backends.cudnn.benchmark,
        )
        
        # Reuse inference_webui singleton models instead of loading duplicate BERT/HuBERT copies.
        tokenizer = getattr(webui_mod, "tokenizer", None)
        bert_model = getattr(webui_mod, "bert_model", None)
        ssl_model = getattr(webui_mod, "ssl_model", None)
        
        # inference_webui auto-loads SoVITS at import time. Only reload if that contract changes.
        if getattr(webui_mod, "vq_model", None) is None:
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
        
        target_dtype = torch.float32
        if use_rocm_mixed_precision:
            target_dtype = _get_rocm_dtype(
                torch,
                rocm_weight_dtype_name,
                torch.float16,
            )

        if is_half:
            webui_mod.t2s_model = webui_mod.t2s_model.half()
        elif use_rocm_mixed_precision and target_dtype != torch.float32:
            webui_mod.t2s_model = webui_mod.t2s_model.to(dtype=target_dtype)
        webui_mod.t2s_model = webui_mod.t2s_model.to(device)
        _install_rocm_mixed_precision_hooks(webui_mod)

        tokenizer = getattr(webui_mod, "tokenizer", tokenizer)
        bert_model = getattr(webui_mod, "bert_model", bert_model)
        ssl_model = getattr(webui_mod, "ssl_model", ssl_model)
        _clear_gpu_cache()
        
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

def get_tts_wav(
    ref_wav_path,
    prompt_text,
    prompt_language,
    text,
    text_language,
    speed=1.0,
    cut_strategy: Optional[str] = None,
):
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
    request_plan = _plan_tts_requests(text, text_language, cut_strategy)
    
    # Timing diagnostics: measure where the request spends time.
    started_at = time.perf_counter()
    chunks_emitted = 0
    logger.info(
        "TTS request shaping: chars=%d speed=%.2f planned_chunks=%d",
        len(text),
        speed,
        len(request_plan),
    )
    try:
        import torch

        if device == "cuda" and torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
    except Exception:
        pass
    _log_gpu_memory("before_request")

    try:
        import numpy as np
        import torch

        if not request_plan:
            raise RuntimeError("No TTS text chunks were produced for synthesis")

        audio_segments = []
        final_sample_rate = None

        with torch.inference_mode():
            for chunk_index, (chunk_text, chunk_cut_strategy) in enumerate(
                request_plan,
                start=1,
            ):
                resolved_cut = _get_cut_option_label(chunk_cut_strategy)
                logger.info(
                    "TTS subrequest %d/%d: chars=%d cut=%s text='%s...'",
                    chunk_index,
                    len(request_plan),
                    len(chunk_text),
                    resolved_cut,
                    chunk_text[:50].replace("\n", " "),
                )

                for sample_rate, audio_data in webui_module.get_tts_wav(
                    ref_wav_path,
                    prompt_text,
                    prompt_lang,
                    chunk_text,
                    text_lang,
                    how_to_cut=resolved_cut,
                    speed=speed,
                    if_freeze=False,
                ):
                    if final_sample_rate is None:
                        final_sample_rate = sample_rate
                    chunks_emitted += 1
                    audio_segments.append(audio_data)

                _clear_request_cache()

        if final_sample_rate is None or not audio_segments:
            raise RuntimeError("GPT-SoVITS returned no audio segments")

        final_audio = (
            np.concatenate(audio_segments, axis=0)
            if len(audio_segments) > 1
            else audio_segments[0]
        )

        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, final_audio, final_sample_rate, format='WAV')
        wav_buffer.seek(0)
        yield wav_buffer.read()
    finally:
        finished_at = time.perf_counter()

        # GPT-SoVITS keeps a module-global semantic cache even when freeze mode
        # is not active. Drop it between API requests so tensors do not pile up.
        _clear_request_cache()

        gc.collect()
        _clear_backend_workspaces()
        _clear_gpu_cache()
        _log_gpu_memory("after_request_cleanup")

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
        cut_strategy = request.get("cut_strategy")
        
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
                get_tts_wav(
                    ref_wav_path,
                    prompt_text,
                    prompt_language,
                    text,
                    text_language,
                    speed=speed,
                    cut_strategy=cut_strategy,
                ),
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
            speed_val = data.get("speed", 1.0)
            cut_strategy = data.get("cut_strategy")
        else:
            # Form data format
            form = await request.form()
            text_val = form.get("text")
            ref_audio_b64 = form.get("ref_audio_base64")
            ref_text_val = form.get("ref_text")
            language_val = form.get("language", "en")
            speed_val = form.get("speed", 1.0)
            cut_strategy = form.get("cut_strategy")
        
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
            get_tts_wav(
                str(temp_audio_path),
                ref_text_val,
                prompt_language,
                text_val,
                text_language,
                speed=float(speed_val),
                cut_strategy=cut_strategy,
            ),
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
