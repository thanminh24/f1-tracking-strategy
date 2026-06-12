"""Source management REST endpoints.

GET  /api/sessions/{key}/source  → current source + available sources
POST /api/sessions/{key}/source  → switch source ("archive" | "live" | "livef1")
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from f1_strategy.feeder.session_registry import registry

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["source"])

OPENF1_LIVE_URL = "https://api.openf1.org/v1/sessions?session_key=latest"


class SourceRequest(BaseModel):
    source: str  # "archive" | "live" | "livef1"


async def _openf1_available() -> bool:
    """Quick probe: returns True if OpenF1 is accessible (not blocked for live session)."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(OPENF1_LIVE_URL)
            if r.status_code == 403 or (
                r.status_code == 200
                and "restricted to authenticated" in r.text.lower()
            ):
                return False
            return r.status_code < 500
    except Exception:
        return False


@router.get("/sessions/{session_key}/source")
async def get_source(session_key: str) -> dict:
    openf1_ok = await _openf1_available()
    return {
        "session_key": session_key,
        "source": registry.get_source(session_key),
        "available_sources": ["archive", "live", "livef1"],
        "live_available": openf1_ok,
        "livef1_available": True,  # SignalR stream; always accessible
        "note": None if openf1_ok else "OpenF1 restricted during live session — use 'livef1' source",
    }


@router.post("/sessions/{session_key}/source")
def set_source(session_key: str, body: SourceRequest) -> dict:
    try:
        registry.set_source(session_key, body.source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log.info("source switched: %s → %s", session_key, body.source)
    return {"session_key": session_key, "source": body.source}


@router.post("/sessions/{session_key}/source/auto")
async def auto_source(session_key: str) -> dict:
    """Select the best available live source automatically.

    Tries OpenF1 first; falls back to livef1 SignalR if OpenF1 is restricted.
    """
    if await _openf1_available():
        chosen = "live"
    else:
        chosen = "livef1"
    registry.set_source(session_key, chosen)
    log.info("auto source: %s → %s", session_key, chosen)
    return {"session_key": session_key, "source": chosen, "auto": True}
