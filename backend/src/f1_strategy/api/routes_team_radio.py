"""Team radio timeline REST endpoint.

Archive sessions resolve radio via OpenF1 metadata. Live sessions already receive
radio captures over the WebSocket race-state stream.
"""

import logging
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, HttpUrl

from f1_strategy.feeder.openf1_client import OpenF1Client
from f1_strategy.models.session_meta import parse_session_key
from f1_strategy.radio.transcription import transcribe_audio_url

router = APIRouter(prefix="/api", tags=["team_radio"])
log = logging.getLogger(__name__)

SESSION_CODE_TO_OPENF1 = {
    "R": "Race",
    "Q": "Qualifying",
    "S": "Sprint",
    "SQ": "Sprint Qualifying",
    "SS": "Sprint Shootout",
    "FP1": "Practice 1",
    "FP2": "Practice 2",
    "FP3": "Practice 3",
}


def _parse_utc(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


@router.get("/sessions/{key}/team-radio")
async def get_team_radio(key: str) -> list[dict]:
    """
    Fetch team radio metadata for an archived session via OpenF1.
    Returns empty list if the session cannot be resolved or the provider has no data.

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
    client = OpenF1Client()
    try:
        year, round_num, session_type = parse_session_key(key)
        openf1_session_type = SESSION_CODE_TO_OPENF1.get(session_type)
        if openf1_session_type is None:
            return []

        session = await client.find_session(year, round_num, openf1_session_type)
        if session is None:
            return []

        captures = await client.team_radio(session.session_key)
        messages = []
        for entry in captures:
            if entry.driver_number is None or not entry.recording_url:
                continue
            messages.append(
                {
                    "lap": 0,
                    "t_session_s": _parse_utc(entry.date),
                    "driver_code": str(entry.driver_number),
                    "msg": None,
                    "audio_url": entry.recording_url,
                }
            )
        messages.sort(key=lambda item: item["t_session_s"], reverse=True)
        return messages
    except ValueError:
        return []
    except Exception as exc:
        log.exception("team_radio fetch failed for %s: %s", key, exc)
        return []
    finally:
        await client.close()


class TranscribeRequest(BaseModel):
    audio_url: HttpUrl


@router.post("/team-radio/transcribe")
async def transcribe_team_radio(body: TranscribeRequest) -> dict:
    """Transcribe a team-radio clip (optional faster-whisper dependency)."""
    return await transcribe_audio_url(str(body.audio_url))
