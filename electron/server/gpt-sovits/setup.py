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

# Platform detection
IS_WINDOWS = platform.system() == 'Windows'
IS_MACOS = platform.system() == 'Darwin'
IS_ARM_MAC = IS_MACOS and platform.machine() == 'arm64'

# ROCm on Windows requires Python 3.12.
_requested_backend_early = os.environ.get('GPTSOVITS_TORCH_BACKEND', 'auto').strip().lower()
IS_ROCM_WINDOWS = IS_WINDOWS and _requested_backend_early == 'rocm'
PYTHON_DIR = BASE_DIR / ("python312" if IS_ROCM_WINDOWS else "python")

# When True, skip-if-installed checks are bypassed (e.g. user clicked Reinstall).
IS_FORCE_REINSTALL = os.environ.get('GPTSOVITS_FORCE_REINSTALL', '0') == '1'

SUPPORTED_TORCH_BACKENDS = {'auto', 'cpu', 'cuda', 'rocm', 'sycl', 'metal'}
TORCH_INDEX_URLS = {
    'cpu': 'https://download.pytorch.org/whl/cpu',
    'cuda': 'https://download.pytorch.org/whl/cu121',
    'rocm': 'https://download.pytorch.org/whl/rocm6.2.4',
    'sycl': 'https://download.pytorch.org/whl/xpu',
}

# AMD ROCm Windows direct wheel repository
ROCM_WINDOWS_BASE_URL = "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1"
ROCM_WINDOWS_SDK_WHEELS = [
    f"{ROCM_WINDOWS_BASE_URL}/rocm_sdk_core-7.2.1-py3-none-win_amd64.whl",
    f"{ROCM_WINDOWS_BASE_URL}/rocm_sdk_devel-7.2.1-py3-none-win_amd64.whl",
    f"{ROCM_WINDOWS_BASE_URL}/rocm_sdk_libraries_custom-7.2.1-py3-none-win_amd64.whl",
]
ROCM_WINDOWS_TORCH_WHEELS = [
    f"{ROCM_WINDOWS_BASE_URL}/torch-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl",
    f"{ROCM_WINDOWS_BASE_URL}/torchaudio-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl",
    f"{ROCM_WINDOWS_BASE_URL}/torchvision-0.24.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl",
]

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
        if IS_ROCM_WINDOWS:
            python_url = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-embed-amd64.zip"
            pth_filename = "python312._pth"
            log("[PYTHON] Setting up embedded Python 3.12 for Windows (ROCm)...")
        else:
            python_url = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip"
            pth_filename = "python310._pth"
            log("[PYTHON] Setting up embedded Python 3.10 for Windows...")

        python_zip = PYTHON_DIR / "python.zip"
        download_file(python_url, python_zip)
        
        log("[PYTHON] Extracting runtime...")
        with zipfile.ZipFile(python_zip, 'r') as zip_ref:
            zip_ref.extractall(PYTHON_DIR)
        
        python_zip.unlink()
        log("[PYTHON] ✓ Runtime extracted")
        
        # Enable site-packages in embedded Python
        pth_file = PYTHON_DIR / pth_filename
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

def create_jieba_fast_stub(python_dir):
    """Create a jieba_fast package stub that proxies to jieba.

    jieba_fast is a C-extension speedup for jieba with an identical API.
    It has no prebuilt Windows wheels for any Python version, so we install
    jieba (pure Python) instead and place a stub package named jieba_fast in
    site-packages that re-exports everything from jieba. GPT-SoVITS does
    'import jieba_fast as jieba' — the stub satisfies the import transparently.
    """
    site_packages = python_dir / "Lib" / "site-packages"
    stub_dir = site_packages / "jieba_fast"
    stub_dir.mkdir(exist_ok=True)

    stub_init = stub_dir / "__init__.py"
    stub_init.write_text(
        "# jieba_fast stub for Windows — proxies to jieba (identical API)\n"
        "from jieba import *  # noqa: F401,F403\n"
        "from jieba import (cut, lcut, cut_for_search, lcut_for_search,\n"
        "                   load_userdict, add_word, del_word, suggest_freq,\n"
        "                   initialize, set_dictionary, tokenize)\n"
        "import jieba as _jieba\n"
        "dt = _jieba.dt\n"
        "re_han = _jieba.re_han_default\n",
        encoding='utf-8'
    )

    # jieba_fast.posseg is used by GPT-SoVITS chinese.py: 'import jieba_fast.posseg as psg'
    posseg_init = stub_dir / "posseg.py"
    posseg_init.write_text(
        "# jieba_fast.posseg stub — proxies to jieba.posseg (identical API)\n"
        "from jieba.posseg import *  # noqa: F401,F403\n"
        "from jieba.posseg import cut, lcut, POSTokenizer\n",
        encoding='utf-8'
    )
    log("[INSTALL] \u2713 Created jieba_fast stub package (proxies to jieba)")


def create_rocm_sdk_stub(python_dir):
    """Create a rocm_sdk package stub that adds AMD DLL directories to the search
    path and satisfies torch's 'import rocm_sdk; rocm_sdk.initialize_process()'
    call on Windows.

    The AMD SDK wheels install as _rocm_sdk_core and _rocm_sdk_libraries_custom
    in site-packages. They ship the actual DLLs (amdhip64, hipblas, etc.) but do
    not provide a top-level 'rocm_sdk' Python package, which torch._rocm_init
    expects. This stub adds both bin/ directories to os.add_dll_directory() and
    implements initialize_process() as a no-op after the DLL paths are registered.
    """
    site_packages = python_dir / "Lib" / "site-packages"
    stub_dir = site_packages / "rocm_sdk"
    stub_dir.mkdir(exist_ok=True)

    stub_init = stub_dir / "__init__.py"
    stub_init.write_text(
        "# rocm_sdk stub for Windows — adds AMD DLL dirs and satisfies torch._rocm_init\n"
        "import os\n"
        "import sys\n"
        "from pathlib import Path\n"
        "\n"
        "_site_packages = Path(__file__).resolve().parent.parent\n"
        "_dll_dirs = [\n"
        "    _site_packages / '_rocm_sdk_core' / 'bin',\n"
        "    _site_packages / '_rocm_sdk_libraries_custom' / 'bin',\n"
        "    _site_packages / '_rocm_sdk_libraries_custom' / 'bin' / 'rocblas',\n"
        "    _site_packages / '_rocm_sdk_libraries_custom' / 'bin' / 'hipblaslt',\n"
        "]\n"
        "\n"
        "_registered_dirs = []\n"
        "for _d in _dll_dirs:\n"
        "    if _d.is_dir() and hasattr(os, 'add_dll_directory'):\n"
        "        try:\n"
        "            _registered_dirs.append(os.add_dll_directory(str(_d)))\n"
        "        except OSError:\n"
        "            pass\n"
        "\n"
        "\n"
        "def initialize_process(preload_shortnames=None, check_version=None):\n"
        "    \"\"\"Called by torch._rocm_init.initialize(). DLLs are already on the\n"
        "    search path from module-level os.add_dll_directory() calls above.\"\"\"\n"
        "    pass\n",
        encoding='utf-8'
    )
    log("[INSTALL] \u2713 Created rocm_sdk stub package (adds AMD DLL dirs for torch ROCm)")


def _build_rocm_metapackage_wheel():
    """Create a minimal rocm-7.2.1-py3-none-any.whl and return its path.

    AMD ships rocm-7.2.1.tar.gz (a source dist) to provide the rocm==7.2.1
    Python package that torch depends on. Embedded Python cannot build source
    distributions. A wheel is just a zip with dist-info metadata, so we create
    one directly in Python — no compiler or build tools needed.
    """
    metadata = (
        "Metadata-Version: 2.1\n"
        "Name: rocm\n"
        "Version: 7.2.1\n"
        "Summary: ROCm metapackage\n"
    )
    wheel_info = (
        "Wheel-Version: 1.0\n"
        "Generator: vassist-setup\n"
        "Root-Is-Purelib: true\n"
        "Tag: py3-none-any\n"
    )
    record = (
        "rocm-7.2.1.dist-info/METADATA,,\n"
        "rocm-7.2.1.dist-info/WHEEL,,\n"
        "rocm-7.2.1.dist-info/RECORD,,\n"
    )
    wheel_path = BASE_DIR / "rocm-7.2.1-py3-none-any.whl"
    with zipfile.ZipFile(str(wheel_path), 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("rocm-7.2.1.dist-info/METADATA", metadata)
        zf.writestr("rocm-7.2.1.dist-info/WHEEL", wheel_info)
        zf.writestr("rocm-7.2.1.dist-info/RECORD", record)
    return wheel_path


def install_pytorch_rocm_windows(python_exe):
    """Install AMD ROCm 7.2.1 SDK + PyTorch for Windows (requires Python 3.12).

    torch depends on rocm==7.2.1. AMD ships this as rocm-7.2.1.tar.gz (a source
    dist), but embedded Python cannot build source distributions. Instead we
    create an equivalent pre-built wheel in Python code (a wheel is just a zip
    with dist-info metadata) and install that first so torch's dependency is
    satisfied without any compilation.
    """
    log("[PYTORCH] Installing AMD ROCm SDK + PyTorch for Windows (ROCm 7.2.1)...")
    log("[PYTORCH] NOTE: Large download (~3.5 GB). Please be patient.")

    # Skip if torch is already installed and this is not a forced reinstall.
    site_packages = PYTHON_DIR / "Lib" / "site-packages"
    torch_installed = any(
        d.name.startswith('torch-') and d.name.endswith('.dist-info')
        for d in site_packages.iterdir()
        if d.is_dir()
    ) if site_packages.exists() else False

    if torch_installed and not IS_FORCE_REINSTALL:
        log("[PYTORCH] ✓ PyTorch already installed, skipping SDK + torch download")
        return

    log("[PYTORCH] Step 1/2: Installing AMD ROCm SDK (~1.4 GB)...")
    rocm_wheel = _build_rocm_metapackage_wheel()
    try:
        subprocess.run([
            str(python_exe), "-m", "pip", "install",
            *ROCM_WINDOWS_SDK_WHEELS,
            str(rocm_wheel),
            "--no-cache-dir", "--no-warn-script-location"
        ], check=True)
    finally:
        if rocm_wheel.exists():
            rocm_wheel.unlink()
    log("[PYTORCH] ✓ ROCm SDK installed")

    log("[PYTORCH] Step 2/2: Installing PyTorch + ROCm 7.2.1 (~823 MB)...")
    subprocess.run([
        str(python_exe), "-m", "pip", "install",
        *ROCM_WINDOWS_TORCH_WHEELS,
        "--no-cache-dir", "--no-warn-script-location"
    ], check=True)
    log("[PYTORCH] ✓ AMD ROCm PyTorch installed")


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
            # AMD's Windows ROCm wheels are on their own repo, not download.pytorch.org
            install_pytorch_rocm_windows(python_exe)
            return
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
    requirements_platform = BASE_DIR / "requirements_platform.txt"
    
    if IS_ARM_MAC:
        # macOS: Build a platform-safe requirements file.
        # onnxruntime-gpu has no macOS wheels, so switch to CPU onnxruntime.
        with open(requirements, 'r', encoding='utf-8') as src, open(requirements_platform, 'w', encoding='utf-8') as dst:
            for line in src:
                stripped = line.strip()
                if stripped == 'onnxruntime-gpu':
                    dst.write('onnxruntime\n')
                    continue
                dst.write(line)

        log("[INSTALL] Installing dependencies...")
        
        # Install PyTorch first
        install_pytorch(requested_backend)
        
        # Install all dependencies
        try:
            result = subprocess.run([
                str(python_exe), "-m", "pip", "install", "-r", str(requirements_platform),
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
        finally:
            if requirements_platform.exists():
                requirements_platform.unlink()
        return
    
    # Windows: Install only with embedded Python runtime
    embedded_python_exe = PYTHON_DIR / "python.exe"

    # ROCm on Windows: Python 3.12 embedded, AMD wheels, pyopenjtalk-plus prebuilt
    if IS_ROCM_WINDOWS:
        # pyopenjtalk-prebuilt has no cp312 wheel → pyopenjtalk-plus has a cp312 Windows wheel
        # onnxruntime-gpu has no Windows ROCm build → fall back to CPU onnxruntime
        # jieba_fast has no Windows wheels → install jieba + create stub package
        # opencc has no cp312 Windows wheel → install opencc-python-reimplemented (pure Python)

        # Check if dependencies are already installed (skip heavy pip download unless forced).
        site_packages = PYTHON_DIR / "Lib" / "site-packages"
        deps_installed = any(
            d.name.startswith('fastapi-') and d.name.endswith('.dist-info')
            for d in site_packages.iterdir()
            if d.is_dir()
        ) if site_packages.exists() else False

        if deps_installed and not IS_FORCE_REINSTALL:
            log("[INSTALL] ✓ Dependencies already installed, skipping pip download")
            # Always re-create stubs (idempotent, fast, no network)
            create_jieba_fast_stub(PYTHON_DIR)
            create_rocm_sdk_stub(PYTHON_DIR)
            install_pytorch(requested_backend)
            return

        with open(requirements, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        requirements_rocm_win = BASE_DIR / "requirements_rocm_win.txt"
        with open(requirements_rocm_win, 'w', encoding='utf-8') as f:
            for line in lines:
                stripped = line.strip()
                if not stripped or stripped.startswith('#'):
                    continue
                if stripped.startswith('--index-url') or stripped.startswith('--no-binary'):
                    continue
                if 'jieba_fast' in stripped:
                    f.write('jieba\n')
                    log("[INSTALL] Replacing jieba_fast with jieba (pure Python, no cp312 Windows wheel)")
                    continue
                if 'opencc' in stripped:
                    f.write('opencc-python-reimplemented\n')
                    log("[INSTALL] Replacing opencc with opencc-python-reimplemented (pure Python)")
                    continue
                if 'pyopenjtalk' in stripped:
                    f.write('pyopenjtalk-plus\n')
                    log("[INSTALL] Replacing pyopenjtalk with pyopenjtalk-plus (cp312 prebuilt wheel)")
                    continue
                if 'onnxruntime-gpu' in stripped:
                    f.write('onnxruntime\n')
                    log("[INSTALL] Replacing onnxruntime-gpu with onnxruntime (no ROCm build for Windows)")
                    continue
                f.write(line)

        try:
            install_pytorch(requested_backend)

            log("[INSTALL] Installing dependencies for ROCm Windows...")
            result = subprocess.run([
                str(embedded_python_exe), "-m", "pip", "install", "-r", str(requirements_rocm_win),
                "--no-warn-script-location"
            ], capture_output=True, text=True, check=True)
            log(result.stdout)
            if result.stderr:
                log(result.stderr)
            log("[INSTALL] ✓ Dependencies installed for ROCm Windows")
            create_jieba_fast_stub(PYTHON_DIR)
            create_rocm_sdk_stub(PYTHON_DIR)

        except subprocess.CalledProcessError as e:
            log(f"[ERROR] Failed to install dependencies:")
            log(f"Exit code: {e.returncode}")
            log(f"STDOUT: {e.stdout}")
            log(f"STDERR: {e.stderr}")
            raise
        finally:
            if requirements_rocm_win.exists():
                requirements_rocm_win.unlink()
        return

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
    
    log("[INSTALL] Skipping system Python compilation path")
    log("[INSTALL] Runtime setup uses embedded CPython only")
    log("[WARNING] opencc/jieba_fast native compile step is disabled in embedded-only mode")
    
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

    # Patch 4: distrib.py — fix torch.distributed.ReduceOp.SUM used as a default
    # argument. This evaluates at *module load time* (not call time), so it fails on
    # ROCm / any build where torch.distributed is lazy-loaded and ReduceOp isn't yet
    # populated. We replace the default with None and resolve it inside the function.
    distrib_file = BASE_DIR / "GPT-SoVITS" / "GPT_SoVITS" / "module" / "distrib.py"
    if not distrib_file.exists():
        log("[PATCH] ✗ distrib.py not found, skipping ReduceOp patch")
    else:
        content = distrib_file.read_text(encoding='utf-8')
        if '_VASSIST_REDUCOP_PATCHED' in content:
            log("[PATCH] ✓ distrib.py ReduceOp already patched")
        else:
            old_reduce = (
                "def all_reduce(tensor: torch.Tensor, op=torch.distributed.ReduceOp.SUM):\n"
                "    if is_distributed():\n"
                "        return torch.distributed.all_reduce(tensor, op)"
            )
            new_reduce = (
                "# _VASSIST_REDUCOP_PATCHED\n"
                "def all_reduce(tensor: torch.Tensor, op=None):\n"
                "    if op is None:\n"
                "        # Resolve lazily so ReduceOp isn't needed at module-load time\n"
                "        # (required for ROCm where torch.distributed is lazy)\n"
                "        op = torch.distributed.ReduceOp.SUM\n"
                "    if is_distributed():\n"
                "        return torch.distributed.all_reduce(tensor, op)"
            )
            if old_reduce in content:
                content = content.replace(old_reduce, new_reduce)
                distrib_file.write_text(content, encoding='utf-8')
                log("[PATCH] ✓ Patched distrib.py: all_reduce ReduceOp.SUM resolved lazily")
            else:
                log("[PATCH] ✗ Could not find all_reduce signature in distrib.py (may have changed)")


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
