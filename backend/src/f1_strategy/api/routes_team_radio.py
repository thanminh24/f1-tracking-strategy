"""Team radio timeline REST endpoint. Fetch team radio messages from FastF1."""

import logging

import fastf1
from fastapi import APIRouter

from f1_strategy.models.session_meta import parse_session_key

router = APIRouter(prefix="/api", tags=["team_radio"])
log = logging.getLogger(__name__)


@router.get("/sessions/{key}/team-radio")
async def get_team_radio(key: str) -> list[dict]:
    """
    Fetch team radio messages for a session.
    Returns empty list if data unavailable (FastF1 doesn't always provide team radio).

    Response schema:
    [
      {
        "lap": int,
        "t_session_s": float,
        "driver_code": str,
        "msg": str | null,
        "audio_url": str | null
      }
    ]
    """
    try:
        # Parse session key: "{year}_{round}_{session}"
        year, round_num, session_type = parse_session_key(key)

        # Load session from FastF1
        session = fastf1.get_session(year, round_num, session_type)

        # Load with messages only (lightweight)
        try:
            session.load(laps=False, telemetry=False, weather=False, messages=True)
        except Exception:
            # Session load may fail for various reasons — return empty
            return []

        # Try to access team radio data
        messages = []

        # FastF1 team radio data structure (if available)
        # session._team_radio is a list of dicts with keys: lap, driver, msg, t_session_s
        if hasattr(session, "_team_radio") and session._team_radio:
            for entry in session._team_radio:
                try:
                    messages.append({
                        "lap": int(entry.get("lap", 0)),
                        "t_session_s": float(entry.get("t_session_s", 0)),
                        "driver_code": str(entry.get("driver", entry.get("driver_code", ""))).upper(),
                        "msg": entry.get("msg") or entry.get("message"),
                        "audio_url": None,  # FastF1 doesn't provide direct audio URLs
                    })
                except (ValueError, TypeError):
                    # Skip malformed entries
                    continue

        # Sort by lap (descending — newest first)
        messages.sort(key=lambda x: (-x["lap"], -x["t_session_s"]))

        return messages
    except ValueError:
        # Malformed session key
        return []
    except Exception as exc:
        log.exception("team_radio fetch failed for %s: %s", key, exc)
        return []
