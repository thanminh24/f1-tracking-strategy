"""Optional team-radio speech-to-text (faster-whisper when installed)."""

from __future__ import annotations

import logging
import os
import tempfile
from functools import lru_cache
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

_CACHE: dict[str, dict] = {}


def asr_available() -> bool:
    if os.environ.get("F1_RADIO_ASR", "1") == "0":
        return False
    try:
        import faster_whisper  # noqa: F401

        return True
    except ImportError:
        return False


@lru_cache(maxsize=1)
def _model():
    from faster_whisper import WhisperModel

    model_name = os.environ.get("F1_RADIO_ASR_MODEL", "tiny")
    device = os.environ.get("F1_RADIO_ASR_DEVICE", "cpu")
    compute_type = os.environ.get("F1_RADIO_ASR_COMPUTE", "int8")
    return WhisperModel(model_name, device=device, compute_type=compute_type)


async def transcribe_audio_url(audio_url: str) -> dict:
    """Return cached transcript for an audio URL."""
    cached = _CACHE.get(audio_url)
    if cached is not None:
        return cached

    if not asr_available():
        result = {
            "text": None,
            "status": "unavailable",
            "detail": "ASR not installed. Run: uv sync --group asr",
        }
        _CACHE[audio_url] = result
        return result

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(audio_url)
            response.raise_for_status()
            audio_bytes = response.content
    except Exception as exc:
        log.warning("radio asr download failed: %s", exc)
        result = {"text": None, "status": "error", "detail": f"download failed: {exc}"}
        _CACHE[audio_url] = result
        return result

    suffix = ".mp3"
    if ".m4a" in audio_url.lower():
        suffix = ".m4a"
    elif ".wav" in audio_url.lower():
        suffix = ".wav"

    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = Path(tmp.name)

        segments, _info = _model().transcribe(str(tmp_path), beam_size=1, language="en")
        text = " ".join(
            segment.text.strip() for segment in segments if segment.text.strip()
        ).strip()
        result = {
            "text": text or None,
            "status": "ok" if text else "empty",
            "detail": None if text else "no speech detected",
        }
    except Exception as exc:
        log.exception("radio asr transcribe failed")
        result = {"text": None, "status": "error", "detail": str(exc)}
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)

    _CACHE[audio_url] = result
    return result
