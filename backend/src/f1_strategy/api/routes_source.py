"""Source management REST endpoints.

GET  /api/sessions/{key}/source  → current source + available sources
POST /api/sessions/{key}/source  → switch source ("archive" | "live" | "livef1" | "fixture")
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
    source: str  # "archive" | "live" | "livef1" | "fixture"


async def _openf1_available() -> bool:
    """Quick probe: returns True if OpenF1 is accessible (not live-session restricted)."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(OPENF1_LIVE_URL)
            # OpenF1 returns 401 or 403 during live sessions; 200 with restriction JSON
            if r.status_code in (401, 403):
                return False
            if r.status_code == 200:
                body = r.text.lower()
                if "restricted" in body or "authenticated" in body or "buy.stripe" in body:
                    return False
                try:
                    data = r.json()
                    if isinstance(data, dict) and "detail" in data:
                        return False  # restriction response is a dict with "detail"
                except Exception:
                    pass
            return r.status_code < 500
    except Exception:
        return False


@router.get("/sessions/{session_key}/source")
async def get_source(session_key: str) -> dict:
    openf1_ok = await _openf1_available()
    return {
        "session_key": session_key,
        "source": registry.get_source(session_key),
        "available_sources": ["archive", "live", "livef1", "fixture"],
        "live_available": openf1_ok,
        "livef1_available": True,  # SignalR stream; always accessible
        "fixture_available": True,
        "note": (
            None
            if openf1_ok
            else "OpenF1 restricted during live session — use 'livef1' source"
        ),
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

    Always uses livef1 (SignalR Core) — it works before, during, and after live
    sessions with no authentication required. OpenF1 is unreliable after sessions end.
    """
    chosen = "livef1"
    registry.set_source(session_key, chosen)
    log.info("auto source: %s → %s", session_key, chosen)
    return {"session_key": session_key, "source": chosen, "auto": True}
