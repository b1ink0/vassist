"""
Setup script for GPT-SoVITS TTS server
Downloads models and sets up Python environment
Supports: Windows (x64), macOS (Apple Silicon/M-series)
"""

import os
import sys
import subprocess
import shutil
import platform
import json
from pathlib import Path
import urllib.request
import zipfile
import tarfile

try:
    from tqdm import tqdm
except ImportError:
    print("Installing tqdm for progress bars...", flush=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "tqdm", "--no-warn-script-location"], check=True)
    from tqdm import tqdm

SCRIPT_DIR = Path(__file__).parent
BASE_DIR = Path(os.environ.get("GPTSOVITS_DATA_DIR", str(SCRIPT_DIR)))
MODELS_DIR = BASE_DIR / "models"
PYTHON_DIR = BASE_DIR / "python"

# Platform detection
IS_WINDOWS = platform.system() == 'Windows'
IS_MACOS = platform.system() == 'Darwin'
IS_ARM_MAC = IS_MACOS and platform.machine() == 'arm64'

SUPPORTED_TORCH_BACKENDS = {'auto', 'cpu', 'cuda', 'rocm', 'sycl', 'metal'}
TORCH_INDEX_URLS = {
    'cpu': 'https://download.pytorch.org/whl/cpu',
    'cuda': 'https://download.pytorch.org/whl/cu121',
    'rocm': 'https://download.pytorch.org/whl/rocm6.2.4',
    'sycl': 'https://download.pytorch.org/whl/xpu',
}

def log(message):
    """Print with immediate flush for real-time streaming"""
    print(message, flush=True)
    sys.stdout.flush()

def get_requested_torch_backend():
    """Read requested backend from environment with safe default."""
    backend = os.environ.get('GPTSOVITS_TORCH_BACKEND', 'auto').strip().lower()
    if backend not in SUPPORTED_TORCH_BACKENDS:
        log(f"[PYTORCH] Unknown backend '{backend}', falling back to auto")
        return 'auto'
    return backend

def get_python_exe():
    """Get the Python executable path for current platform"""
    if IS_WINDOWS:
        return PYTHON_DIR / "python.exe"
    else:
        return PYTHON_DIR / "bin" / "python3"

def inspect_torch_installation(python_exe):
    """Inspect installed torch build type from the embedded runtime."""
    probe = subprocess.run([
        str(python_exe), "-c",
        (
            "import json, platform, torch; "
            "v=torch.__version__; "
            "cuda=getattr(torch.version,'cuda',None); "
            "hip=getattr(torch.version,'hip',None); "
            "mps_built=hasattr(torch.backends,'mps') and torch.backends.mps.is_built(); "
            "xpu_ok=hasattr(torch,'xpu') and torch.xpu.is_available(); "
            "build=('cuda' if ('+cu' in v or cuda) else "
            "'rocm' if ('+rocm' in v or hip) else "
            "'sycl' if ('+xpu' in v or xpu_ok) else "
            "'cpu' if '+cpu' in v else "
            "'metal' if (platform.system()=='Darwin' and mps_built) else 'unknown'); "
            "print(json.dumps({'version': v, 'build': build, 'cuda_available': torch.cuda.is_available(), 'cuda_version': cuda, 'hip_version': hip, 'xpu_available': bool(xpu_ok), 'mps_built': bool(mps_built)}))"
        )
    ], capture_output=True, text=True, check=False)

    if probe.returncode != 0:
        return None

    try:
        return json.loads(probe.stdout.strip())
    except Exception:
        return None

def check_cuda_available():
    """Check if CUDA is available on the system (Windows/Linux only)"""
    if IS_MACOS:
        # macOS uses Metal Performance Shaders (MPS), not CUDA
        log("[INFO] macOS detected - will use Metal Performance Shaders (MPS) for GPU acceleration")
        return False
    
    try:
        # Try nvidia-smi first
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=driver_version,cuda_version', '--format=csv,noheader'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            log(f"[GPU] NVIDIA GPU detected: {result.stdout.strip()}")
            return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    
    # Try nvcc as fallback
    try:
        result = subprocess.run(
            ['nvcc', '--version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and 'cuda' in result.stdout.lower():
            # Extract CUDA version from output
            for line in result.stdout.split('\n'):
                if 'release' in line.lower():
                    log(f"[GPU] CUDA toolkit found: {line.strip()}")
                    return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    
    log("[INFO] No CUDA/GPU detected, will use CPU version of PyTorch")
    return False

def download_file(url, dest):
    """Download file with progress bar"""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    
    log(f"[DOWNLOAD] {dest.name}...")
    
    try:
        response = urllib.request.urlopen(url)
        total_size = int(response.headers.get('content-length', 0))
        
        with open(dest, 'wb') as f, tqdm(
            total=total_size,
            unit='B',
            unit_scale=True,
            unit_divisor=1024,
            desc=dest.name
        ) as pbar:
            chunk_size = 8192
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                pbar.update(len(chunk))
        
        log(f"[DOWNLOAD] ✓ {dest.name} complete")
    except Exception as e:
        log(f"[ERROR] Download failed: {e}")
        raise

def setup_python_runtime():
    """Download and setup Python runtime for current platform"""
    if PYTHON_DIR.exists():
        log(f"[PYTHON] ✓ Runtime already exists at {PYTHON_DIR}")
        return
        
    PYTHON_DIR.mkdir(parents=True)
    
    if IS_WINDOWS:
        # Windows: Download embedded Python package
        python_url = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip"
        python_zip = PYTHON_DIR / "python.zip"
        
        log("[PYTHON] Setting up embedded Python for Windows...")
        download_file(python_url, python_zip)
        
        log("[PYTHON] Extracting runtime...")
        with zipfile.ZipFile(python_zip, 'r') as zip_ref:
            zip_ref.extractall(PYTHON_DIR)
        
        python_zip.unlink()
        log("[PYTHON] ✓ Runtime extracted")
        
        # Enable site-packages in embedded Python
        pth_file = PYTHON_DIR / "python310._pth"
        if pth_file.exists():
            content = pth_file.read_text()
            # Uncomment site import line
            content = content.replace("#import site", "import site")
            # Add Scripts to path
            content += "\nScripts\n"
            pth_file.write_text(content)
        
        # Get pip
        log("[PYTHON] Installing pip...")
        get_pip = PYTHON_DIR / "get-pip.py"
        download_file("https://bootstrap.pypa.io/get-pip.py", get_pip)
        
        python_exe = get_python_exe()
        subprocess.run([str(python_exe), str(get_pip)], check=True)
        
        log("[PYTHON] ✓ pip installed")
        
    elif IS_ARM_MAC:
        log("[PYTHON] Verifying Python runtime (should be installed by bootstrap)...")
        python_exe = get_python_exe()
        
        if not python_exe.exists():
            log("[ERROR] Python runtime not found!")
            log("[ERROR] Bootstrap should have installed Python to: " + str(PYTHON_DIR))
            log("[ERROR] Please run bootstrap first or install manually")
            sys.exit(1)
        
        # Verify Python works
        result = subprocess.run([str(python_exe), '--version'], capture_output=True, text=True)
        log(f"[PYTHON] ✓ Found Python: {result.stdout.strip()}")
        
        # Verify pip exists
        log("[PYTHON] Verifying pip...")
        result = subprocess.run([str(python_exe), '-m', 'pip', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            log(f"[PYTHON] ✓ pip ready: {result.stdout.strip()}")
        else:
            log("[ERROR] pip not found in Python installation")
            sys.exit(1)
        log("[PYTHON] ✓ pip installed")
    
    else:
        log(f"[ERROR] Unsupported platform: {platform.system()} {platform.machine()}")
        log("[ERROR] Supported: Windows x64, macOS Apple Silicon (M1/M2/M3)")
        sys.exit(1)

def install_pytorch(requested_backend='auto'):
    """Install PyTorch with platform-specific acceleration"""
    python_exe = get_python_exe()
    
    log("\n" + "="*60)
    log("[PYTORCH] Installing PyTorch...")
    log("="*60)
    
    if IS_ARM_MAC:
        # macOS Apple Silicon: Install PyTorch with MPS (Metal Performance Shaders) support
        if requested_backend not in ('auto', 'metal', 'cpu'):
            log(f"[PYTORCH] Backend '{requested_backend}' is not supported on Apple Silicon, using metal")
        effective_backend = 'metal' if requested_backend != 'cpu' else 'cpu'

        log(f"[PYTORCH] Installing for Apple Silicon ({effective_backend.upper()} mode)...")
        log("[PYTORCH] This will enable GPU acceleration via Metal")
        try:
            subprocess.run([
                str(python_exe), "-m", "pip", "install",
                "torch", "torchaudio",
                "--no-warn-script-location"
            ], check=True)
            log("[PYTORCH] ✓ PyTorch with MPS support installed")
            
            # Verify MPS is available
            result = subprocess.run([
                str(python_exe), "-c",
                "import torch; print(f'MPS available: {torch.backends.mps.is_available()}, Built: {torch.backends.mps.is_built()}')"
            ], capture_output=True, text=True, check=False)
            log(f"[PYTORCH] {result.stdout.strip()}")
            
        except subprocess.CalledProcessError as e:
            log(f"[ERROR] PyTorch installation failed: {e}")
            sys.exit(1)
    
    elif IS_WINDOWS:
        index_map = TORCH_INDEX_URLS

        if requested_backend == 'auto':
            requested_backend = 'cuda' if check_cuda_available() else 'cpu'

        if requested_backend == 'metal':
            log(f"[PYTORCH] Backend '{requested_backend}' is not supported on Windows, falling back to CPU")
            requested_backend = 'cpu'

        if requested_backend == 'rocm':
            log("[PYTORCH] ROCm selected on Windows - using configured ROCm index URL")
        if requested_backend == 'sycl':
            log("[PYTORCH] SYCL/XPU selected on Windows - using configured XPU index URL")

        index_url = index_map.get(requested_backend, index_map['cpu'])

        log(f"[PYTORCH] Installing backend: {requested_backend.upper()}")
        if requested_backend == 'cuda':
            log("[PYTORCH] This may take 10-30 minutes depending on your internet speed.")

        try:
            result = subprocess.run([
                str(python_exe), "-m", "pip", "install",
                "torch", "torchaudio",
                "--index-url", index_url,
                "--upgrade",
                "--force-reinstall",
                "--no-cache-dir",
                "--no-warn-script-location"
            ], capture_output=True, text=True, check=True)
            log(result.stdout)
            if result.stderr:
                log(result.stderr)

            install_info = inspect_torch_installation(python_exe)
            if install_info:
                log(f"[PYTORCH] Installed torch: {install_info.get('version')} ({install_info.get('build')})")
                if requested_backend != 'cpu' and install_info.get('build') == 'cpu':
                    raise RuntimeError(
                        f"Requested backend {requested_backend.upper()} but torch build is CPU ({install_info.get('version')})"
                    )
            else:
                log("[PYTORCH] Warning: Unable to inspect installed torch build")

            log(f"[PYTORCH] ✓ PyTorch {requested_backend.upper()} installed")

            if requested_backend == 'cuda':
                result = subprocess.run([
                    str(python_exe), "-c",
                    "import torch; print(f'CUDA available: {torch.cuda.is_available()}, torch.version.cuda: {torch.version.cuda}, torch.__version__: {torch.__version__}')"
                ], capture_output=True, text=True, check=False)
                log(f"[PYTORCH] {result.stdout.strip()}")
        except (subprocess.CalledProcessError, RuntimeError) as e:
            if requested_backend != 'cpu':
                log(f"[WARNING] PyTorch {requested_backend.upper()} installation failed: {e}")
                log("[PYTORCH] Falling back to CPU version...")
                cpu_url = index_map['cpu']
                result = subprocess.run([
                    str(python_exe), "-m", "pip", "install",
                    "torch", "torchaudio",
                    "--index-url", cpu_url,
                    "--upgrade",
                    "--force-reinstall",
                    "--no-cache-dir",
                    "--no-warn-script-location"
                ], capture_output=True, text=True, check=True)
                log(result.stdout)
                if result.stderr:
                    log(result.stderr)
                install_info = inspect_torch_installation(python_exe)
                if install_info:
                    log(f"[PYTORCH] Installed torch: {install_info.get('version')} ({install_info.get('build')})")
                log("[PYTORCH] ✓ PyTorch CPU installed")
            else:
                log(f"[ERROR] PyTorch CPU installation failed:")
                if isinstance(e, subprocess.CalledProcessError):
                    log(f"Exit code: {e.returncode}")
                    log(f"STDOUT: {e.stdout}")
                    log(f"STDERR: {e.stderr}")
                else:
                    log(str(e))
                raise

def install_dependencies():
    """Install Python dependencies"""
    python_exe = get_python_exe()
    
    requested_backend = get_requested_torch_backend()
    log(f"[PYTORCH] Requested backend from settings: {requested_backend}")

    requirements = SCRIPT_DIR / "requirements.txt"
    requirements_no_pyopenjtalk = BASE_DIR / "requirements_temp.txt"
    
    if IS_ARM_MAC:
        # macOS: Simpler approach - install all dependencies directly
        # No need to separate compilation packages on macOS
        log("[INSTALL] Installing dependencies...")
        
        # Install PyTorch first
        install_pytorch(requested_backend)
        
        # Install all dependencies
        try:
            result = subprocess.run([
                str(python_exe), "-m", "pip", "install", "-r", str(requirements),
                "--no-warn-script-location"
            ], capture_output=True, text=True, check=True)
            log(result.stdout)
            if result.stderr:
                log(result.stderr)
            log("[INSTALL] ✓ All dependencies installed")
        except subprocess.CalledProcessError as e:
            log(f"[ERROR] Failed to install dependencies:")
            log(f"Exit code: {e.returncode}")
            log(f"STDOUT: {e.stdout}")
            log(f"STDERR: {e.stderr}")
            raise
        return
    
    # Windows: Original complex approach with system Python for compilation
    embedded_python_exe = PYTHON_DIR / "python.exe"
    
    # Try to find system Python (has dev headers for compilation)
    system_python = shutil.which('python') or shutil.which('python3')
    
    # Find CMake
    cmake_exe = shutil.which('cmake')
    env = os.environ.copy()
    if cmake_exe:
        cmake_path = str(Path(cmake_exe).parent)
        log(f"[CMAKE] ✓ Found at: {cmake_path}")
        env['PATH'] = cmake_path + os.pathsep + env.get('PATH', '')
        env['CMAKE_PROGRAM'] = cmake_exe
    
    # Packages that need compilation (pyopenjtalk removed - using pyopenjtalk-prebuilt instead)
    compile_packages = ['opencc', 'jieba_fast']
    
    # Create temp requirements without packages that need compilation
    # Also remove --no-binary and --index-url directives
    with open(requirements, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    with open(requirements_no_pyopenjtalk, 'w', encoding='utf-8') as f:
        for line in lines:
            stripped = line.strip()
            # Skip empty lines, comments, --index-url, and compilation packages
            if not stripped or stripped.startswith('#'):
                continue
            if stripped.startswith('--index-url') or stripped.startswith('--no-binary'):
                log(f"[INSTALL] Skipping directive: {stripped}")
                continue
            # Skip lines that mention compile packages
            if any(pkg in line for pkg in compile_packages):
                log(f"[INSTALL] Skipping compilation package: {stripped}")
                continue
            f.write(line)
    
    # Install PyTorch first (CUDA or CPU based on GPU availability)
    try:
        install_pytorch(requested_backend)
    except Exception as e:
        log(f"[ERROR] PyTorch installation failed: {e}")
        import traceback
        log(traceback.format_exc())
        raise
    
    # Install all dependencies except pyopenjtalk to embedded Python
    log("[INSTALL] Installing dependencies to embedded Python...")
    try:
        result = subprocess.run([
            str(embedded_python_exe), "-m", "pip", "install", "-r", str(requirements_no_pyopenjtalk),
            "--no-warn-script-location"
        ], capture_output=True, text=True, check=True)
        log(result.stdout)
        if result.stderr:
            log(result.stderr)
    except subprocess.CalledProcessError as e:
        log(f"[ERROR] Failed to install dependencies:")
        log(f"Exit code: {e.returncode}")
        log(f"STDOUT: {e.stdout}")
        log(f"STDERR: {e.stderr}")
        raise
    
    # Try to compile packages with system Python, then copy to embedded
    if cmake_exe and system_python:
        for package_name in compile_packages:
            log(f"[COMPILE] {package_name} with system Python (has dev headers)...")
            try:
                # Get package spec with version if specified
                package_spec = package_name
                
                # Install to system Python temporarily
                subprocess.run([
                    system_python, "-m", "pip", "install", package_spec,
                    "--no-warn-script-location"
                ], env=env, check=True, timeout=300)
                
                # Find where it installed (use package import name)
                import_name = package_name.replace('-', '_')
                result = subprocess.run([
                    system_python, "-c", 
                    f"import {import_name}, os; print(os.path.dirname({import_name}.__file__))"
                ], capture_output=True, text=True, check=True)
                
                package_path = Path(result.stdout.strip())
                target_path = PYTHON_DIR / "Lib" / "site-packages" / import_name
                
                # Copy compiled package to embedded Python
                if package_path.exists():
                    import shutil as sh
                    sh.copytree(package_path, target_path, dirs_exist_ok=True)
                    log(f"[COMPILE] ✓ {package_name} compiled and copied to embedded Python")
                
            except Exception as e:
                log(f"[WARNING] {package_name} compilation failed: {e}")
                log(f"[WARNING] {package_name} will not be available")
    else:
        if not cmake_exe:
            log("[WARNING] CMake not found")
        if not system_python:
            log("[WARNING] System Python not found (needed for compiling C++ extensions)")
        log("[WARNING] Compiled packages (opencc, jieba_fast) will not be available")
        log("[INFO] Note: pyopenjtalk-prebuilt is already installed and doesn't need compilation")
    
    # Clean up temp file if it exists
    if requirements_no_pyopenjtalk.exists():
        requirements_no_pyopenjtalk.unlink()
    
    # Uninstall decoders package (causes transformers import errors)
    log("\n" + "="*60)
    log("[INSTALL] Removing incompatible decoders package...")
    log("="*60)
    try:
        subprocess.run([
            str(python_exe), "-m", "pip", "uninstall", "-y", "decoders"
        ], check=False)
        log("[INSTALL] ✓ Removed decoders package")
    except Exception as e:
        log(f"[WARNING] Failed to remove decoders: {e}")
    
    log("[INSTALL] ✓ Dependencies installed")

def clone_gptsovits_repo():
    """Download GPT-SoVITS source code from GitHub as ZIP"""
    gptsovits_dir = BASE_DIR / "GPT-SoVITS"
    
    if gptsovits_dir.exists():
        log(f"[REPO] ✓ GPT-SoVITS source already exists at {gptsovits_dir}")
        return
    
    log("\n" + "="*60)
    log("[REPO] Downloading GPT-SoVITS source code from GitHub...")
    log("="*60)

    # Download as ZIP from GitHub (no git required)
    commit_hash = "bfca0f6b2dd9f846c76366be807f01a8873140a0"
    zip_url = f"https://github.com/RVC-Boss/GPT-SoVITS/archive/{commit_hash}.zip"
    zip_path = BASE_DIR / "gptsovits_source.zip"
    
    try:
        log(f"[REPO] Downloading from {zip_url}...")
        download_file(zip_url, zip_path)
        
        log(f"[REPO] Extracting to {gptsovits_dir}...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # GitHub zips create a folder named "GPT-SoVITS-{commit_hash}"
            # We need to extract and rename it to "GPT-SoVITS"
            zip_ref.extractall(BASE_DIR)
        
        # Rename extracted folder - use shutil.move for better Windows compatibility
        # Folder name will be GPT-SoVITS-{commit_hash[:7]}
        extracted_dir = BASE_DIR / f"GPT-SoVITS-{commit_hash}"
        if extracted_dir.exists():
            # Delete target if it exists (in case of partial previous install)
            if gptsovits_dir.exists():
                log(f"[REPO] Removing existing partial installation...")
                shutil.rmtree(gptsovits_dir)
            
            # Use shutil.move instead of Path.rename (more robust on Windows)
            import time
            time.sleep(0.5)  # Small delay to ensure extraction is complete
            shutil.move(str(extracted_dir), str(gptsovits_dir))
            log(f"[REPO] ✓ Renamed {extracted_dir.name} to {gptsovits_dir.name}")
        
        # Clean up ZIP file
        if zip_path.exists():
            zip_path.unlink()
        
        log("[REPO] ✓ GPT-SoVITS source downloaded and extracted successfully")
        log(f"[REPO] Location: {gptsovits_dir}")
        
    except Exception as e:
        log(f"[ERROR] Failed to download GPT-SoVITS: {e}")
        log(f"[INFO] You can manually download and extract: {zip_url}")
        # Clean up on failure
        if zip_path.exists():
            zip_path.unlink()
        # Clean up extracted folder if rename failed
        extracted_dir = BASE_DIR / "GPT-SoVITS-main"
        if extracted_dir.exists():
            try:
                shutil.rmtree(extracted_dir)
            except:
                pass
        raise

def download_models():
    """Download pre-trained GPT-SoVITS models from Hugging Face"""
    MODELS_DIR.mkdir(exist_ok=True)
    
    log("\n" + "="*60)
    log("[MODELS] Downloading GPT-SoVITS v2Pro+ models from Hugging Face...")
    log("="*60)
    
    # Base URL for Hugging Face
    hf_base = "https://huggingface.co/lj1995/GPT-SoVITS/resolve/main"
    
    # Models to download (English & Japanese support)
    models = {
        # GPT text-to-semantic model (s1 series)
        "s1v3.ckpt": f"{hf_base}/s1v3.ckpt",
        
        # v2Pro+ models (best quality, fastest inference)
        "v2Pro/s2Dv2ProPlus.pth": f"{hf_base}/v2Pro/s2Dv2ProPlus.pth",
        "v2Pro/s2Gv2ProPlus.pth": f"{hf_base}/v2Pro/s2Gv2ProPlus.pth",
        
        # Speaker verification model
        "sv/pretrained_eres2netv2w24s4ep4.ckpt": f"{hf_base}/sv/pretrained_eres2netv2w24s4ep4.ckpt",
    }
    
    for model_path, url in models.items():
        dest = MODELS_DIR / model_path
        
        # Skip if already downloaded
        if dest.exists():
            log(f"[MODELS] ✓ {model_path} already exists, skipping...")
            continue
        
        try:
            download_file(url, dest)
                
        except Exception as e:
            log(f"[ERROR] Failed to download {model_path}: {e}")
            log(f"[INFO] You can manually download from: {url}")
    
    log("\n[MODELS] ✓ Model download complete!")
    log(f"[MODELS] Saved to: {MODELS_DIR}")

def download_bert_model():
    """Download Chinese RoBERTa model for GPT-SoVITS"""
    from huggingface_hub import snapshot_download
    
    bert_dir = MODELS_DIR / "chinese-roberta-wwm-ext-large"
    
    log("\n" + "="*60)
    log("[BERT] Downloading BERT model for text processing...")
    log("="*60)
    
    if bert_dir.exists() and (bert_dir / "config.json").exists():
        log(f"[BERT] ✓ Model already exists: {bert_dir}")
        return
    
    try:
        log(f"[BERT] Downloading hfl/chinese-roberta-wwm-ext-large from HuggingFace...")
        log("[BERT] (Only PyTorch weights - ~1.3GB)")
        snapshot_download(
            repo_id="hfl/chinese-roberta-wwm-ext-large",
            local_dir=str(bert_dir),
            local_dir_use_symlinks=False,
            allow_patterns=["*.json", "*.txt", "*.bin", "*.model"]  # Only PyTorch + tokenizer files
        )
        log(f"[BERT] ✓ Model downloaded to {bert_dir}")
    except Exception as e:
        log(f"[ERROR] Failed to download BERT model: {e}")
        log("[WARNING] TTS text processing will not work until model is downloaded")

def download_hubert_model():
    """Download Chinese HuBERT model for audio feature extraction"""
    from huggingface_hub import snapshot_download
    
    hubert_dir = MODELS_DIR / "chinese-hubert-base"
    
    log("\n" + "="*60)
    log("[HUBERT] Downloading HuBERT model for audio features...")
    log("="*60)
    
    if hubert_dir.exists() and (hubert_dir / "pytorch_model.bin").exists():
        log(f"[HUBERT] ✓ Model already exists: {hubert_dir}")
        return
    
    try:
        log(f"[HUBERT] Downloading TencentGameMate/chinese-hubert-base from HuggingFace...")
        log("[HUBERT] (Only PyTorch weights - ~400MB)")
        snapshot_download(
            repo_id="TencentGameMate/chinese-hubert-base",
            local_dir=str(hubert_dir),
            local_dir_use_symlinks=False,
            allow_patterns=["*.json", "*.txt", "*.bin", "*.model"]  # Only PyTorch + config files
        )
        log(f"[HUBERT] ✓ Model downloaded to {hubert_dir}")
    except Exception as e:
        log(f"[ERROR] Failed to download HuBERT model: {e}")
        log("[WARNING] TTS audio processing will not work until model is downloaded")

def patch_gptsovits_for_api():
    """Patch GPT-SoVITS files for API usage"""
    log("\n" + "="*60)
    log("[PATCH] Configuring GPT-SoVITS for API usage...")
    log("="*60)
    
    # Patch 1: inference_webui.py to skip auto-loading
    inference_file = BASE_DIR / "GPT-SoVITS" / "GPT_SoVITS" / "inference_webui.py"
    
    if not inference_file.exists():
        log("[PATCH] ✗ GPT-SoVITS inference_webui.py not found, skipping patch")
    else:
        # Read the file
        content = inference_file.read_text(encoding='utf-8')
        
        # Check if already patched
        if '_GPTSOVITS_INFER' in content:
            log("[PATCH] ✓ inference_webui.py already patched")
        else:
            # Patch: wrap auto-load in environment variable check
            old_code = 'change_gpt_weights(gpt_path)\nos.environ["HF_ENDPOINT"]'
            new_code = '''# Skip auto-loading for API usage (controlled by environment variable)
if not os.environ.get("_GPTSOVITS_INFER"):
    change_gpt_weights(gpt_path)
os.environ["HF_ENDPOINT"]'''
            
            if old_code in content:
                content = content.replace(old_code, new_code)
                inference_file.write_text(content, encoding='utf-8')
                log("[PATCH] ✓ Patched inference_webui.py to skip auto-loading in API mode")
            else:
                log("[PATCH] ✗ Could not find code to patch in inference_webui.py (GPT-SoVITS may have been updated)")
    
    # Patch 2: sv.py to find speaker verification model in models/sv/
    sv_file = BASE_DIR / "GPT-SoVITS" / "GPT_SoVITS" / "sv.py"
    
    if not sv_file.exists():
        log("[PATCH] ✗ GPT-SoVITS sv.py not found, skipping patch")
    else:
        # Read the file
        content = sv_file.read_text(encoding='utf-8')
        
        # Check if already patched
        if 'alt_path = os.path.join(os.path.dirname(__file__)' in content:
            log("[PATCH] ✓ sv.py already patched")
        else:
            # Replace the hardcoded sv_path line with fallback logic
            old_sv_path = 'sv_path = "GPT_SoVITS/pretrained_models/sv/pretrained_eres2netv2w24s4ep4.ckpt"'
            new_sv_path = '''sv_path = "GPT_SoVITS/pretrained_models/sv/pretrained_eres2netv2w24s4ep4.ckpt"
# Fallback: Try relative path to electron/server/gpt-sovits/models/sv/
if not os.path.exists(sv_path):
    alt_path = os.path.join(os.path.dirname(__file__), "../../models/sv/pretrained_eres2netv2w24s4ep4.ckpt")
    if os.path.exists(alt_path):
        sv_path = alt_path'''
            
            if old_sv_path in content:
                content = content.replace(old_sv_path, new_sv_path)
                sv_file.write_text(content, encoding='utf-8')
                log("[PATCH] ✓ Patched sv.py to find SV model in ../../models/sv/ directory")
            else:
                log("[PATCH] ✗ Could not find sv_path line to patch (GPT-SoVITS structure changed)")
    
    # Patch 3: inference_webui.py to use soundfile instead of torchaudio.load
    if inference_file.exists():
        content = inference_file.read_text(encoding='utf-8')
        
        # Check if already patched
        if 'import soundfile as sf' in content and 'sf.read(filename)' in content:
            log("[PATCH] ✓ inference_webui.py already patched for soundfile")
        else:
            # Replace torchaudio.load with soundfile.read
            old_audio_load = '    sr1 = int(hps.data.sampling_rate)\n    audio, sr0 = torchaudio.load(filename)'
            new_audio_load = '''    sr1 = int(hps.data.sampling_rate)
    # Use soundfile instead of torchaudio.load (torchcodec not available)
    import soundfile as sf
    audio_np, sr0 = sf.read(filename)
    audio = torch.FloatTensor(audio_np).unsqueeze(0) if len(audio_np.shape) == 1 else torch.FloatTensor(audio_np).T'''
            
            if old_audio_load in content:
                content = content.replace(old_audio_load, new_audio_load)
                inference_file.write_text(content, encoding='utf-8')
                log("[PATCH] ✓ Patched inference_webui.py to use soundfile instead of torchaudio.load")
            else:
                log("[PATCH] ✗ Could not find torchaudio.load code to patch (GPT-SoVITS may have been updated)")

def download_nltk_data():
    """Download required NLTK data for English text processing"""
    python_exe = get_python_exe()
    
    log("\n" + "="*60)
    log("[NLTK] Downloading NLTK data for English TTS...")
    log("="*60)
    
    try:
        # Download English POS tagger (averaged_perceptron_tagger_eng)
        subprocess.run([
            str(python_exe), "-c",
            "import nltk; nltk.download('averaged_perceptron_tagger_eng'); nltk.download('universal_tagset'); print('✓ NLTK data downloaded')"
        ], check=True)
        log("[NLTK] ✓ Data downloaded successfully")
    except Exception as e:
        log(f"[ERROR] Failed to download NLTK data: {e}")
        log("[WARNING] English TTS may not work properly")

def download_fast_langdetect_model():
    """Download fast-langdetect model for language detection"""
    # Download to GPT-SoVITS/GPT_SoVITS/pretrained_models/fast_langdetect
    langdetect_dir = BASE_DIR / "GPT-SoVITS" / "GPT_SoVITS" / "pretrained_models" / "fast_langdetect"
    langdetect_dir.mkdir(parents=True, exist_ok=True)
    
    log("\n" + "="*60)
    log("[LANGDETECT] Downloading fast-langdetect model...")
    log("="*60)
    
    # Facebook FastText language detection model (~130MB)
    model_url = "https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin"
    model_path = langdetect_dir / "lid.176.bin"
    
    if model_path.exists():
        log(f"[LANGDETECT] ✓ Model already exists: {model_path}")
        return
    
    try:
        download_file(model_url, model_path)
        log(f"[LANGDETECT] ✓ Model downloaded to {model_path}")
    except Exception as e:
        log(f"[ERROR] Failed to download fast-langdetect model: {e}")
        log("[WARNING] Multi-language TTS may not work until model is downloaded")

def download_whisper_models():
    """Download Whisper GGML models for STT"""
    # Download to electron/server/models/whisper
    whisper_dir = BASE_DIR.parent / "models" / "whisper"
    whisper_dir.mkdir(parents=True, exist_ok=True)
    
    log("\n" + "="*60)
    log("[WHISPER] Downloading Whisper STT models...")
    log("="*60)
    
    # Download tiny.en model (~75MB, English only, 4x faster than base)
    model_url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"
    model_path = whisper_dir / "ggml-tiny.en.bin"
    
    if model_path.exists():
        log(f"[WHISPER] ✓ Model already exists: {model_path}")
        return
    
    try:
        download_file(model_url, model_path)
        log(f"[WHISPER] ✓ Model downloaded to {model_path}")
    except Exception as e:
        log(f"[ERROR] Failed to download Whisper model: {e}")
        log("[WARNING] STT will not work until model is downloaded")

def main():
    log("="*60)
    log("GPT-SoVITS TTS Server Setup")
    log("="*60)
    
    try:
        # Step 1: Setup Python runtime
        log("\n[1/10] Setting up Python runtime...")
        setup_python_runtime()
        
        # Step 2: Install dependencies
        log("\n[2/10] Installing Python dependencies...")
        install_dependencies()
        
        # Step 3: Clone GPT-SoVITS source
        log("\n[3/10] Downloading GPT-SoVITS source code...")
        clone_gptsovits_repo()
        
        # Step 4: Patch GPT-SoVITS for API usage
        log("\n[4/10] Configuring GPT-SoVITS for API mode...")
        patch_gptsovits_for_api()
        
        # Step 5: Download TTS models
        log("\n[5/10] Downloading TTS models...")
        download_models()
        
        # Step 6: Download BERT model
        log("\n[6/10] Downloading BERT model...")
        download_bert_model()
        
        # Step 7: Download HuBERT model
        log("\n[7/10] Downloading HuBERT model...")
        download_hubert_model()
        
        # Step 8: Download NLTK data for English
        log("\n[8/10] Downloading NLTK data...")
        download_nltk_data()
        
        # Step 9: Download fast-langdetect model
        log("\n[9/10] Downloading language detection model...")
        download_fast_langdetect_model()
        
        # Step 10: Download Whisper STT models
        log("\n[10/10] Downloading Whisper speech recognition models...")
        download_whisper_models()
        
        log("\n" + "="*60)
        log("✓ Setup complete!")
        log("="*60)
        
        # Print platform-specific start command
        if IS_WINDOWS:
            log(f"\nTo start server:")
            log(f"  {PYTHON_DIR / 'python.exe'} {BASE_DIR / 'api.py'}")
        elif IS_ARM_MAC:
            log(f"\nTo start server:")
            log(f"  {PYTHON_DIR / 'bin' / 'python3'} {BASE_DIR / 'api.py'}")
        
    except Exception as e:
        log(f"\n✗ Setup failed: {e}")
        import traceback
        log(f"\nFull error details:")
        log(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()
