"""Runtime capability/profile endpoint for frontend workspace gating."""

import os

from fastapi import APIRouter

from f1_strategy.radio.transcription import asr_available

router = APIRouter(prefix="/api", tags=["capabilities"])


def _flag(name: str, default: str = "1") -> bool:
    return os.environ.get(name, default) != "0"


@router.get("/capabilities")
async def capabilities() -> dict:
    profile = os.environ.get("F1_RUNTIME_PROFILE", "full")
    archive_enabled = _flag("F1_ENABLE_ARCHIVE")
    whatif_enabled = _flag("F1_ENABLE_WHATIF")
    predictions_enabled = _flag("F1_PREDICTIONS")
    training_enabled = _flag("F1_ENABLE_TRAINING", "0")

    return {
        "profile": profile,
        "features": {
            "live": True,
            "archive": archive_enabled,
            "fixture": True,
            "replay": archive_enabled,
            "radio": True,
            "radio_asr": asr_available(),
            "strategy": predictions_enabled,
            "what_if": whatif_enabled,
            "training": training_enabled,
        },
        "providers": {
            "livef1": "enabled",
            "openf1": "enabled",
            "fixture": "enabled",
            "archive": "enabled" if archive_enabled else "disabled",
        },
        "sources": {
            "archive": archive_enabled,
            "live": True,
            "livef1": True,
            "fixture": True,
        },
        "models": {
            "predictions": "enabled" if predictions_enabled else "disabled",
            "training": "enabled" if training_enabled else "disabled",
        },
        "cache_policy": {
            "bundled_race_data": False,
            "archive_download": "on-demand" if archive_enabled else "disabled",
        },
    }
