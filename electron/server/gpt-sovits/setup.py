"""
Setup script for GPT-SoVITS TTS server
Downloads models and sets up Python environment
"""

import os
import sys
import subprocess
from pathlib import Path
import urllib.request
import zipfile
from tqdm import tqdm

BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
PYTHON_DIR = BASE_DIR / "python"

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
    """Download embedded Python runtime for Windows"""
    if not PYTHON_DIR.exists():
        PYTHON_DIR.mkdir(parents=True)
        
        # Download Python embeddable package
        python_url = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip"
        python_zip = PYTHON_DIR / "python.zip"
        
        print("Setting up Python runtime...")
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
        
        python_exe = PYTHON_DIR / "python.exe"
        subprocess.run([str(python_exe), str(get_pip)], check=True)
        
        print("✓ pip installed")

def install_dependencies():
    """Install Python dependencies"""
    python_exe = PYTHON_DIR / "python.exe"
    
    requirements = BASE_DIR / "requirements.txt"
    
    print("Installing dependencies...")
    subprocess.run([
        str(python_exe), "-m", "pip", "install", "-r", str(requirements),
        "--no-warn-script-location"
    ], check=True)
    
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

def main():
    """Main setup function"""
    print("=" * 60)
    print("GPT-SoVITS TTS Server Setup")
    print("=" * 60)
    
    try:
        setup_python_runtime()
        install_dependencies()
        clone_gptsovits_repo()
        download_models()
        
        print("\n" + "=" * 60)
        print("✓ Setup complete!")
        print("=" * 60)
        print(f"\nTo start server:")
        print(f"  {PYTHON_DIR / 'python.exe'} {BASE_DIR / 'api.py'}")
        
    except Exception as e:
        print(f"\n✗ Setup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
