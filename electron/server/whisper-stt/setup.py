"""
Whisper STT setup script
Installs dependencies and warms up tiny.en model using embedded Python runtime.
"""

import os
import sys
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
BASE_DIR = Path(os.environ.get("GPTSOVITS_DATA_DIR", str(SCRIPT_DIR)))
PYTHON_DIR = BASE_DIR / "python"
WHISPER_MODEL_DIR = BASE_DIR.parent / "models" / "whisper"


def log(message):
    print(message, flush=True)


def get_python_exe():
    if os.name == 'nt':
        return PYTHON_DIR / "python.exe"

    py3 = PYTHON_DIR / "bin" / "python3"
    if py3.exists():
        return py3
    return PYTHON_DIR / "bin" / "python"


def install_dependencies(python_exe):
    requirements = SCRIPT_DIR / "requirements.txt"
    if not requirements.exists():
        raise RuntimeError(f"requirements.txt not found at {requirements}")

    log("[WHISPER] Installing dependencies...")
    subprocess.run([
        str(python_exe), "-m", "pip", "install",
        "-r", str(requirements),
        "--no-warn-script-location"
    ], check=True)
    log("[WHISPER] ✓ Dependencies installed")


def warmup_model(python_exe):
    WHISPER_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    log("[WHISPER] Downloading/warming tiny.en model...")

    warmup_code = """
from faster_whisper import WhisperModel
import os
model_dir = os.environ.get('WHISPER_MODEL_DIR')
WhisperModel('tiny.en', device='cpu', compute_type='int8', download_root=model_dir)
print('model-ready')
"""

    env = {
        **os.environ,
        "WHISPER_MODEL_DIR": str(WHISPER_MODEL_DIR),
    }

    subprocess.run([
        str(python_exe), "-c", warmup_code
    ], env=env, check=True)

    log("[WHISPER] ✓ tiny.en model ready")


def main():
    log("=" * 60)
    log("Whisper STT Setup")
    log("=" * 60)

    python_exe = get_python_exe()
    if not python_exe.exists():
        raise RuntimeError(f"Embedded Python not found at {python_exe}")

    install_dependencies(python_exe)
    warmup_model(python_exe)

    log("=" * 60)
    log("✓ Whisper setup complete")
    log("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        log(f"✗ Whisper setup failed: {error}")
        raise
