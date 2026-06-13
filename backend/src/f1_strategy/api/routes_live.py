"""Live session detection endpoints — backed by livef1 (F1 official livetiming + Jolpica).

No OpenF1 dependency: uses livef1 package which pulls from livetiming.formula1.com
(same source as official timing screens, no API key required).

GET /api/live/current-session  — quick active-session check
GET /api/live/schedule         — active + upcoming sessions for next 48h (home screen)
"""

from fastapi import APIRouter

from f1_strategy.feeder.livef1_schedule_client import get_current_session, get_schedule

router = APIRouter()


@router.get("/api/live/current-session")
async def current_session() -> dict:
    """Returns the currently active F1 session.

    Off-weekend: {"session_key": null, "status": "none"}
    Active:      {"session_key": "live", "session_type": "Practice 3", "circuit": "Catalunya", ...}
    """
    session = await get_current_session()
    if session is None:
        return {"session_key": None, "openf1_key": None, "status": "none"}

    return {
        "session_key": "live",
        "openf1_key": session.session_key,
        "circuit": session.circuit,
        "country": session.country,
        "session_type": session.session_type,
        "date_start": session.date_start.isoformat() if session.date_start else None,
        "date_end": session.date_end.isoformat() if session.date_end else None,
        "status": "active",
    }


@router.get("/api/live/schedule")
async def live_schedule() -> dict:
    """Returns all sessions from 4h ago to 48h ahead — for the home screen Live tab.

    Each session has status: "active" | "upcoming" | "recent"
    """
    sessions = await get_schedule()
    return {
        "sessions": [
            {
                "openf1_key": s.session_key,
                "circuit": s.circuit,
                "country": s.country,
                "session_type": s.session_type,
                "date_start": s.date_start.isoformat() if s.date_start else None,
                "date_end": s.date_end.isoformat() if s.date_end else None,
                "status": s.status,
            }
            for s in sessions
        ]
    }
