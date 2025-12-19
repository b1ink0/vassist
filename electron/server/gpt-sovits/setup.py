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
from pathlib import Path
import urllib.request
import zipfile
import tarfile
from tqdm import tqdm

BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
PYTHON_DIR = BASE_DIR / "python"

# Platform detection
IS_WINDOWS = platform.system() == 'Windows'
IS_MACOS = platform.system() == 'Darwin'
IS_ARM_MAC = IS_MACOS and platform.machine() == 'arm64'

def get_python_exe():
    """Get the Python executable path for current platform"""
    if IS_WINDOWS:
        return PYTHON_DIR / "python.exe"
    else:
        return PYTHON_DIR / "bin" / "python3"

def check_cuda_available():
    """Check if CUDA is available on the system (Windows/Linux only)"""
    if IS_MACOS:
        # macOS uses Metal Performance Shaders (MPS), not CUDA
        print("ℹ macOS detected - will use Metal Performance Shaders (MPS) for GPU acceleration")
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
            print(f"✓ NVIDIA GPU detected: {result.stdout.strip()}")
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
                    print(f"✓ CUDA toolkit found: {line.strip()}")
                    return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    
    print("ℹ No CUDA/GPU detected, will use CPU version of PyTorch")
    return False

def download_file(url, dest):
    """Download file with progress bar"""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"Downloading {dest.name}...")
    
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
        
        print(f"✓ Downloaded {dest.name}")
    except Exception as e:
        print(f"✗ Download failed: {e}")
        raise

def setup_python_runtime():
    """Download and setup Python runtime for current platform"""
    if PYTHON_DIR.exists():
        print(f"✓ Python runtime already exists at {PYTHON_DIR}")
        return
        
    PYTHON_DIR.mkdir(parents=True)
    
    if IS_WINDOWS:
        # Windows: Download embedded Python package
        python_url = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip"
        python_zip = PYTHON_DIR / "python.zip"
        
        print("Setting up Python runtime for Windows...")
        download_file(python_url, python_zip)
        
        with zipfile.ZipFile(python_zip, 'r') as zip_ref:
            zip_ref.extractall(PYTHON_DIR)
        
        python_zip.unlink()
        print("✓ Python runtime extracted")
        
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
        get_pip = PYTHON_DIR / "get-pip.py"
        download_file("https://bootstrap.pypa.io/get-pip.py", get_pip)
        
        python_exe = get_python_exe()
        subprocess.run([str(python_exe), str(get_pip)], check=True)
        
        print("✓ pip installed")
        
    elif IS_ARM_MAC:
        # macOS ARM: Download standalone Python build for Apple Silicon
        python_url = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-macos11.pkg"
        
        print("Setting up Python runtime for macOS (Apple Silicon)...")
        print("Note: Using system Python with virtual environment approach")
        
        # Create virtual environment using system Python
        system_python = shutil.which('python3')
        if not system_python:
            print("✗ System Python3 not found. Please install Python 3.10+ from python.org")
            print("  Download: https://www.python.org/downloads/macos/")
            sys.exit(1)
        
        # Check Python version
        result = subprocess.run([system_python, '--version'], capture_output=True, text=True)
        print(f"✓ Found system Python: {result.stdout.strip()}")
        
        # Create virtual environment
        subprocess.run([system_python, '-m', 'venv', str(PYTHON_DIR)], check=True)
        print("✓ Virtual environment created")
        
        # Upgrade pip
        python_exe = get_python_exe()
        subprocess.run([str(python_exe), '-m', 'pip', 'install', '--upgrade', 'pip'], check=True)
        print("✓ pip installed")
    
    else:
        print(f"✗ Unsupported platform: {platform.system()} {platform.machine()}")
        print("  Supported: Windows x64, macOS Apple Silicon (M1/M2/M3)")
        sys.exit(1)

def install_pytorch():
    """Install PyTorch with platform-specific acceleration"""
    python_exe = get_python_exe()
    
    print("\n" + "="*60)
    print("Installing PyTorch...")
    print("="*60)
    
    if IS_ARM_MAC:
        # macOS Apple Silicon: Install PyTorch with MPS (Metal Performance Shaders) support
        print("Installing PyTorch for Apple Silicon (MPS acceleration)...")
        print("This will enable GPU acceleration via Metal")
        try:
            subprocess.run([
                str(python_exe), "-m", "pip", "install",
                "torch", "torchaudio",
                "--no-warn-script-location"
            ], check=True)
            print("✓ PyTorch with MPS support installed")
            
            # Verify MPS is available
            result = subprocess.run([
                str(python_exe), "-c",
                "import torch; print(f'MPS available: {torch.backends.mps.is_available()}, Built: {torch.backends.mps.is_built()}')"
            ], capture_output=True, text=True, check=False)
            print(result.stdout.strip())
            
        except subprocess.CalledProcessError as e:
            print(f"⚠ PyTorch installation failed: {e}")
            sys.exit(1)
    
    elif IS_WINDOWS:
        # Windows: Check for CUDA
        has_cuda = check_cuda_available()
        
        if has_cuda:
            print("Installing PyTorch with CUDA 12.1 support (2.4GB download)...")
            print("This may take 10-30 minutes depending on your internet speed.")
            try:
                subprocess.run([
                    str(python_exe), "-m", "pip", "install",
                    "torch", "torchaudio",
                    "--index-url", "https://download.pytorch.org/whl/cu121",
                    "--no-warn-script-location"
                ], check=True)
                print("✓ PyTorch with CUDA installed")
                
                # Verify CUDA is available
                result = subprocess.run([
                    str(python_exe), "-c",
                    "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
                ], capture_output=True, text=True, check=False)
                print(result.stdout.strip())
                
            except subprocess.CalledProcessError as e:
                print(f"⚠ CUDA PyTorch installation failed: {e}")
                print("Falling back to CPU version...")
                has_cuda = False
        
        if not has_cuda:
            print("Installing PyTorch CPU version...")
            subprocess.run([
                str(python_exe), "-m", "pip", "install",
                "torch", "torchaudio",
                "--index-url", "https://download.pytorch.org/whl/cpu",
                "--no-warn-script-location"
            ], check=True)
            print("✓ PyTorch CPU installed")

def install_dependencies():
    """Install Python dependencies"""
    python_exe = get_python_exe()
    
    requirements = BASE_DIR / "requirements.txt"
    requirements_no_pyopenjtalk = BASE_DIR / "requirements_temp.txt"
    
    if IS_ARM_MAC:
        # macOS: Simpler approach - install all dependencies directly
        # No need to separate compilation packages on macOS
        print("Installing dependencies...")
        
        # Install PyTorch first
        install_pytorch()
        
        # Install all dependencies
        subprocess.run([
            str(python_exe), "-m", "pip", "install", "-r", str(requirements),
            "--no-warn-script-location"
        ], check=True)
        
        print("✓ All dependencies installed")
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
        print(f"✓ Found CMake at: {cmake_path}")
        env['PATH'] = cmake_path + os.pathsep + env.get('PATH', '')
        env['CMAKE_PROGRAM'] = cmake_exe
    
    # Packages that need compilation (pyopenjtalk removed - using pyopenjtalk-prebuilt instead)
    compile_packages = ['opencc', 'jieba_fast']
    
    # Create temp requirements without packages that need compilation
    with open(requirements, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    with open(requirements_no_pyopenjtalk, 'w', encoding='utf-8') as f:
        for line in lines:
            if not any(pkg in line for pkg in compile_packages):
                f.write(line)
    
    # Install PyTorch first (CUDA or CPU based on GPU availability)
    install_pytorch()
    
    # Install all dependencies except pyopenjtalk to embedded Python
    print("Installing dependencies to embedded Python...")
    subprocess.run([
        str(embedded_python_exe), "-m", "pip", "install", "-r", str(requirements_no_pyopenjtalk),
        "--no-warn-script-location"
    ], check=True)
    
    # Try to compile packages with system Python, then copy to embedded
    if cmake_exe and system_python:
        for package_name in compile_packages:
            print(f"Compiling {package_name} with system Python (has dev headers)...")
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
                    print(f"✓ {package_name} compiled and copied to embedded Python")
                
            except Exception as e:
                print(f"⚠ {package_name} compilation failed: {e}")
                print(f"  {package_name} will not be available")
    else:
        if not cmake_exe:
            print("⚠ CMake not found")
        if not system_python:
            print("⚠ System Python not found (needed for compiling C++ extensions)")
        print("  Compiled packages (opencc, jieba_fast) will not be available")
        print("  Note: pyopenjtalk-prebuilt is already installed and doesn't need compilation")
    
    # Clean up temp file if it exists
    if requirements_no_pyopenjtalk.exists():
        requirements_no_pyopenjtalk.unlink()
    
    # Uninstall decoders package (causes transformers import errors)
    print("\n" + "="*60)
    print("Removing incompatible decoders package...")
    print("="*60)
    try:
        subprocess.run([
            str(python_exe), "-m", "pip", "uninstall", "-y", "decoders"
        ], check=False)
        print("✓ Removed decoders package")
    except Exception as e:
        print(f"⚠ Failed to remove decoders: {e}")
    
    print("✓ Dependencies installed")

def clone_gptsovits_repo():
    """Clone GPT-SoVITS source code repository"""
    gptsovits_dir = BASE_DIR / "GPT-SoVITS"
    
    if gptsovits_dir.exists():
        print(f"✓ GPT-SoVITS source already exists at {gptsovits_dir}")
        return
    
    print("\n" + "="*60)
    print("Cloning GPT-SoVITS source code...")
    print("="*60)
    
    try:
        import subprocess
        result = subprocess.run(
            ["git", "clone", "https://github.com/RVC-Boss/GPT-SoVITS.git", str(gptsovits_dir)],
            check=True,
            capture_output=True,
            text=True
        )
        print("✓ GPT-SoVITS source cloned successfully")
        print(f"Location: {gptsovits_dir}")
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to clone GPT-SoVITS: {e}")
        print("Please clone manually: git clone https://github.com/RVC-Boss/GPT-SoVITS.git")
    except FileNotFoundError:
        print("✗ Git not found. Please install git and try again.")

def download_models():
    """Download pre-trained GPT-SoVITS models from Hugging Face"""
    MODELS_DIR.mkdir(exist_ok=True)
    
    print("\n" + "="*60)
    print("Downloading GPT-SoVITS v2Pro+ models from Hugging Face...")
    print("="*60)
    
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
            print(f"✓ {model_path} already exists, skipping...")
            continue
        
        try:
            download_file(url, dest)
                
        except Exception as e:
            print(f"✗ Failed to download {model_path}: {e}")
            print(f"  You can manually download from: {url}")
    
    print("\n✓ Model download complete!")
    print(f"Models saved to: {MODELS_DIR}")

def download_bert_model():
    """Download Chinese RoBERTa model for GPT-SoVITS"""
    from huggingface_hub import snapshot_download
    
    bert_dir = MODELS_DIR / "chinese-roberta-wwm-ext-large"
    
    print("\n" + "="*60)
    print("Downloading BERT model for text processing...")
    print("="*60)
    
    if bert_dir.exists() and (bert_dir / "config.json").exists():
        print(f"✓ BERT model already exists: {bert_dir}")
        return
    
    try:
        print(f"Downloading hfl/chinese-roberta-wwm-ext-large from HuggingFace...")
        print("(Only PyTorch weights - ~1.3GB)")
        snapshot_download(
            repo_id="hfl/chinese-roberta-wwm-ext-large",
            local_dir=str(bert_dir),
            local_dir_use_symlinks=False,
            allow_patterns=["*.json", "*.txt", "*.bin", "*.model"]  # Only PyTorch + tokenizer files
        )
        print(f"✓ BERT model downloaded to {bert_dir}")
    except Exception as e:
        print(f"✗ Failed to download BERT model: {e}")
        print("  TTS text processing will not work until model is downloaded")

def download_hubert_model():
    """Download Chinese HuBERT model for audio feature extraction"""
    from huggingface_hub import snapshot_download
    
    hubert_dir = MODELS_DIR / "chinese-hubert-base"
    
    print("\n" + "="*60)
    print("Downloading HuBERT model for audio features...")
    print("="*60)
    
    if hubert_dir.exists() and (hubert_dir / "pytorch_model.bin").exists():
        print(f"✓ HuBERT model already exists: {hubert_dir}")
        return
    
    try:
        print(f"Downloading TencentGameMate/chinese-hubert-base from HuggingFace...")
        print("(Only PyTorch weights - ~400MB)")
        snapshot_download(
            repo_id="TencentGameMate/chinese-hubert-base",
            local_dir=str(hubert_dir),
            local_dir_use_symlinks=False,
            allow_patterns=["*.json", "*.txt", "*.bin", "*.model"]  # Only PyTorch + config files
        )
        print(f"✓ HuBERT model downloaded to {hubert_dir}")
    except Exception as e:
        print(f"✗ Failed to download HuBERT model: {e}")
        print("  TTS audio processing will not work until model is downloaded")

def patch_gptsovits_for_api():
    """Patch GPT-SoVITS files for API usage"""
    print("\n" + "="*60)
    print("Patching GPT-SoVITS for API usage...")
    print("="*60)
    
    # Patch 1: inference_webui.py to skip auto-loading
    inference_file = BASE_DIR / "GPT-SoVITS" / "GPT_SoVITS" / "inference_webui.py"
    
    if not inference_file.exists():
        print("✗ GPT-SoVITS inference_webui.py not found, skipping patch")
    else:
        # Read the file
        content = inference_file.read_text(encoding='utf-8')
        
        # Check if already patched
        if '_GPTSOVITS_INFER' in content:
            print("✓ inference_webui.py already patched")
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
                print("✓ Patched inference_webui.py to skip auto-loading in API mode")
            else:
                print("✗ Could not find code to patch in inference_webui.py (GPT-SoVITS may have been updated)")
    
    # Patch 2: sv.py to find speaker verification model in models/sv/
    sv_file = BASE_DIR / "GPT-SoVITS" / "GPT_SoVITS" / "sv.py"
    
    if not sv_file.exists():
        print("✗ GPT-SoVITS sv.py not found, skipping patch")
    else:
        # Read the file
        content = sv_file.read_text(encoding='utf-8')
        
        # Check if already patched
        if '../../models/sv/pretrained_eres2netv2w24s4ep4.ckpt' in content:
            print("✓ sv.py already patched")
        else:
            # Find line with sv_path = os.environ.get
            lines = content.split('\n')
            
            for i, line in enumerate(lines):
                if 'sv_path = os.environ.get("sv_path"' in line:
                    # Insert fallback logic after this line
                    next_line_idx = i + 1
                    
                    # Insert fallback code - point to our models/sv/ directory
                    fallback_code = [
                        'if not os.path.exists(sv_path):',
                        '    # Try relative path to electron/server/gpt-sovits/models/sv/',
                        '    alt_path = os.path.join(os.path.dirname(__file__), "../../models/sv/pretrained_eres2netv2w24s4ep4.ckpt")',
                        '    if os.path.exists(alt_path):',
                        '        sv_path = alt_path',
                    ]
                    
                    lines[next_line_idx:next_line_idx] = fallback_code
                    
                    # Write back
                    content = '\n'.join(lines)
                    sv_file.write_text(content, encoding='utf-8')
                    print("✓ Patched sv.py to find SV model in ../../models/sv/ directory")
                    break
            else:
                print("✗ Could not find sv_path in sv.py (GPT-SoVITS may have been updated)")
    
    # Patch 3: inference_webui.py to use soundfile instead of torchaudio.load
    if inference_file.exists():
        content = inference_file.read_text(encoding='utf-8')
        
        # Check if already patched
        if 'import soundfile as sf' in content and 'sf.read(filename)' in content:
            print("✓ inference_webui.py already patched for soundfile")
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
                print("✓ Patched inference_webui.py to use soundfile instead of torchaudio.load")
            else:
                print("✗ Could not find torchaudio.load code to patch (GPT-SoVITS may have been updated)")

def download_nltk_data():
    """Download required NLTK data for English text processing"""
    python_exe = get_python_exe()
    
    print("\n" + "="*60)
    print("Downloading NLTK data for English TTS...")
    print("="*60)
    
    try:
        # Download English POS tagger (averaged_perceptron_tagger_eng)
        subprocess.run([
            str(python_exe), "-c",
            "import nltk; nltk.download('averaged_perceptron_tagger_eng'); nltk.download('universal_tagset'); print('✓ NLTK data downloaded')"
        ], check=True)
        print("✓ NLTK data downloaded successfully")
    except Exception as e:
        print(f"✗ Failed to download NLTK data: {e}")
        print("  English TTS may not work properly")

def download_fast_langdetect_model():
    """Download fast-langdetect model for language detection"""
    # Download to GPT-SoVITS/GPT_SoVITS/pretrained_models/fast_langdetect
    langdetect_dir = BASE_DIR / "GPT-SoVITS" / "GPT_SoVITS" / "pretrained_models" / "fast_langdetect"
    langdetect_dir.mkdir(parents=True, exist_ok=True)
    
    print("\n" + "="*60)
    print("Downloading fast-langdetect model...")
    print("="*60)
    
    # Facebook FastText language detection model (~130MB)
    model_url = "https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin"
    model_path = langdetect_dir / "lid.176.bin"
    
    if model_path.exists():
        print(f"✓ fast-langdetect model already exists: {model_path}")
        return
    
    try:
        download_file(model_url, model_path)
        print(f"✓ fast-langdetect model downloaded to {model_path}")
    except Exception as e:
        print(f"✗ Failed to download fast-langdetect model: {e}")
        print("  Multi-language TTS may not work until model is downloaded")

def download_whisper_models():
    """Download Whisper GGML models for STT"""
    # Download to electron/server/models/whisper
    whisper_dir = BASE_DIR.parent / "models" / "whisper"
    whisper_dir.mkdir(parents=True, exist_ok=True)
    
    print("\n" + "="*60)
    print("Downloading Whisper STT models...")
    print("="*60)
    
    # Download tiny.en model (~75MB, English only, 4x faster than base)
    model_url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"
    model_path = whisper_dir / "ggml-tiny.en.bin"
    
    if model_path.exists():
        print(f"✓ Whisper model already exists: {model_path}")
        return
    
    try:
        download_file(model_url, model_path)
        print(f"✓ Whisper model downloaded to {model_path}")
    except Exception as e:
        print(f"✗ Failed to download Whisper model: {e}")
        print("  STT will not work until model is downloaded")

def main():
    print("="*60)
    print("GPT-SoVITS TTS Server Setup")
    print("="*60)
    
    try:
        # Step 1: Setup Python runtime
        setup_python_runtime()
        
        # Step 2: Install dependencies
        install_dependencies()
        
        # Step 3: Clone GPT-SoVITS source
        clone_gptsovits_repo()
        
        # Step 4: Patch GPT-SoVITS for API usage
        patch_gptsovits_for_api()
        
        # Step 5: Download TTS models
        download_models()
        
        # Step 6: Download BERT model
        download_bert_model()
        
        # Step 7: Download HuBERT model
        download_hubert_model()
        
        # Step 8: Download NLTK data for English
        download_nltk_data()
        
        # Step 9: Download fast-langdetect model
        download_fast_langdetect_model()
        
        # Step 10: Download Whisper STT models
        download_whisper_models()
        
        print("\n" + "="*60)
        print("✓ Setup complete!")
        print("="*60)
        
        # Print platform-specific start command
        if IS_WINDOWS:
            print(f"\nTo start server:")
            print(f"  {PYTHON_DIR / 'python.exe'} {BASE_DIR / 'api.py'}")
        elif IS_ARM_MAC:
            print(f"\nTo start server:")
            print(f"  {PYTHON_DIR / 'bin' / 'python3'} {BASE_DIR / 'api.py'}")
        
    except Exception as e:
        print(f"\n✗ Setup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
