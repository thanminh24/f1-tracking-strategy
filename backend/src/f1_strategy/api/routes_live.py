"""Live session detection endpoint.

GET /api/live/current-session
  Returns the current or most recent F1 Race session from OpenF1.
  Off-weekend: {"session_key": null, "status": "none"}
  Race weekend: {"session_key": "live", "openf1_key": 12345, "status": "active"}
"""

from fastapi import APIRouter

from f1_strategy.feeder.openf1_client import OpenF1Client

router = APIRouter()


@router.get("/api/live/current-session")
async def current_session() -> dict:
    """Returns the currently active F1 session (Race, Practice, or Qualifying).

    Off-weekend: {"session_key": null, "status": "none"}
    Active:      {"session_key": "live", "openf1_key": 12345, "session_type": "Practice 1", ...}
    """
    client = OpenF1Client()
    try:
        session = await client.current_live_session()
    finally:
        await client.close()

    if session is None:
        return {"session_key": None, "openf1_key": None, "status": "none"}

    return {
        "session_key": "live",
        "openf1_key": session.session_key,
        "year": session.year,
        "circuit": session.circuit_short_name,
        "session_type": session.session_type,
        "status": "active",
    }
