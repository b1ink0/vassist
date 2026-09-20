"""Bounded, content-addressed storage for GPT-SoVITS reference audio."""

from __future__ import annotations

import hashlib
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Optional, Tuple


class ReferenceAudioCache:
    """Store each distinct reference once and evict inactive files safely."""

    def __init__(
        self,
        directory: Path,
        *,
        ttl_seconds: int = 3600,
        max_bytes: int = 256 * 1024 * 1024,
        cleanup_interval_seconds: int = 300,
    ) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.ttl_seconds = max(0, int(ttl_seconds))
        self.max_bytes = max(0, int(max_bytes))
        self.cleanup_interval_seconds = max(0, int(cleanup_interval_seconds))
        self._active: dict[str, int] = {}
        self._lock = threading.RLock()
        self._last_cleanup_at = 0.0

    def acquire(self, audio_data: bytes) -> Tuple[str, Path]:
        """Return a lease for a deduplicated reference-audio file."""
        if not audio_data:
            raise ValueError("Reference audio is empty")

        cache_key = hashlib.sha256(audio_data).hexdigest()
        cache_path = self.directory / f"{cache_key}.wav"

        with self._lock:
            self._cleanup_locked(force=False)
            if not cache_path.exists() or cache_path.stat().st_size != len(audio_data):
                self._atomic_write(cache_path, audio_data)
            else:
                self._touch(cache_path)
            self._active[cache_key] = self._active.get(cache_key, 0) + 1

        return cache_key, cache_path

    def acquire_existing(self, cache_path: Path) -> Optional[Tuple[str, Path]]:
        """Lease a file previously created by this cache, if it still exists."""
        candidate = Path(cache_path)
        try:
            candidate = candidate.resolve(strict=True)
            cache_directory = self.directory.resolve(strict=True)
        except OSError:
            return None

        if candidate.parent != cache_directory or candidate.suffix.lower() != ".wav":
            return None

        cache_key = candidate.stem
        with self._lock:
            if not candidate.exists():
                return None
            self._touch(candidate)
            self._active[cache_key] = self._active.get(cache_key, 0) + 1
        return cache_key, candidate

    def release(self, cache_key: str) -> None:
        """Release a lease and enforce expiry/size limits."""
        with self._lock:
            active_count = self._active.get(cache_key, 0)
            if active_count <= 1:
                self._active.pop(cache_key, None)
            else:
                self._active[cache_key] = active_count - 1
            self._cleanup_locked(force=True)

    def cleanup(self, *, force: bool = True) -> Tuple[int, int]:
        """Remove expired/over-limit inactive files; return files and bytes removed."""
        with self._lock:
            return self._cleanup_locked(force=force)

    def _cleanup_locked(self, *, force: bool) -> Tuple[int, int]:
        now = time.time()
        if (
            not force
            and self.cleanup_interval_seconds > 0
            and now - self._last_cleanup_at < self.cleanup_interval_seconds
        ):
            return 0, 0

        self._last_cleanup_at = now
        removed_files = 0
        removed_bytes = 0
        inactive_files: list[tuple[float, int, Path]] = []
        total_bytes = 0

        for cache_path in self.directory.glob("*.wav"):
            try:
                stat = cache_path.stat()
            except OSError:
                continue

            total_bytes += stat.st_size
            if self._active.get(cache_path.stem, 0) > 0:
                continue

            age_seconds = max(0.0, now - stat.st_mtime)
            if age_seconds >= self.ttl_seconds:
                if self._unlink(cache_path):
                    removed_files += 1
                    removed_bytes += stat.st_size
                    total_bytes -= stat.st_size
                continue

            inactive_files.append((stat.st_mtime, stat.st_size, cache_path))

        if total_bytes > self.max_bytes:
            for _, file_size, cache_path in sorted(inactive_files):
                if total_bytes <= self.max_bytes:
                    break
                if self._unlink(cache_path):
                    removed_files += 1
                    removed_bytes += file_size
                    total_bytes -= file_size

        # Interrupted atomic writes are never useful. Remove old ones lazily.
        for temp_path in self.directory.glob("*.tmp"):
            try:
                if now - temp_path.stat().st_mtime >= 300:
                    temp_path.unlink(missing_ok=True)
            except OSError:
                pass

        return removed_files, removed_bytes

    def _atomic_write(self, cache_path: Path, audio_data: bytes) -> None:
        temporary_path = self.directory / f"{cache_path.stem}.{uuid.uuid4().hex}.tmp"
        try:
            with open(temporary_path, "xb") as temporary_file:
                temporary_file.write(audio_data)
            os.replace(temporary_path, cache_path)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise

    @staticmethod
    def _touch(cache_path: Path) -> None:
        try:
            cache_path.touch(exist_ok=True)
        except OSError:
            pass

    @staticmethod
    def _unlink(cache_path: Path) -> bool:
        try:
            cache_path.unlink(missing_ok=True)
            return True
        except OSError:
            return False


def cleanup_legacy_reference_files(directory: Path) -> Tuple[int, int]:
    """Delete timestamp-named files leaked by older VAssist API versions."""
    legacy_directory = Path(directory)
    if not legacy_directory.exists():
        return 0, 0

    removed_files = 0
    removed_bytes = 0
    for legacy_path in legacy_directory.glob("ref_*.wav"):
        try:
            file_size = legacy_path.stat().st_size
            legacy_path.unlink()
            removed_files += 1
            removed_bytes += file_size
        except OSError:
            continue
    return removed_files, removed_bytes
