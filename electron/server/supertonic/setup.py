"""
Supertonic 3 TTS setup script
Installs the official supertonic Python package (with serve extras) into the
embedded Python runtime and pre-downloads the ~400MB ONNX model assets so the
first synthesis request doesn't pay the download cost.

Uses the same embedded-Python conventions as whisper-stt/setup.py.
"""

import os
import sys
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
BASE_DIR = Path(os.environ.get("GPTSOVITS_DATA_DIR", str(SCRIPT_DIR)))
PYTHON_DIR = BASE_DIR / ("python312" if (os.name == "nt" and (BASE_DIR / "python312").exists()) else "python")


def log(message):
    print(message, flush=True)


def get_python_exe():
    if os.name == "nt":
        return PYTHON_DIR / "python.exe"

    py3 = PYTHON_DIR / "bin" / "python3"
    if py3.exists():
        return py3
    return PYTHON_DIR / "bin" / "python"


def install_dependencies(python_exe):
    log("[SUPERTONIC] Installing supertonic[serve]...")
    subprocess.run(
        [
            str(python_exe), "-m", "pip", "install",
            "supertonic[serve]",
            "--no-warn-script-location",
        ],
        check=True,
    )
    log("[SUPERTONIC] Dependencies installed")


def warmup_model(python_exe):
    log("[SUPERTONIC] Downloading/warming Supertonic-3 ONNX assets (~400MB, one-time)...")

    warmup_code = """
from supertonic import TTS
tts = TTS(auto_download=True)
print('model-ready')
"""

    env = {
        **os.environ,
        # Avoid noisy non-fatal Hugging Face cache warnings in setup logs.
        "HF_HUB_DISABLE_SYMLINKS_WARNING": "1",
        "HF_HUB_DISABLE_XET": "1",
    }

    subprocess.run(
        [str(python_exe), "-c", warmup_code],
        env=env,
        check=True,
    )

    log("[SUPERTONIC] Model assets ready")


def main():
    log("=" * 60)
    log("Supertonic TTS Setup")
    log("=" * 60)

    python_exe = get_python_exe()
    if not python_exe.exists():
        raise RuntimeError(f"Embedded Python not found at {python_exe}")

    install_dependencies(python_exe)
    warmup_model(python_exe)

    log("=" * 60)
    log("Supertonic setup complete")
    log("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        log(f"Supertonic setup failed: {error}")
        raise
