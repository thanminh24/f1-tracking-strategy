"""Session identity + metadata. session_key format: '{year}_{round}_{session}'."""

from datetime import datetime

from pydantic import BaseModel


def make_session_key(year: int, round_num: int, session: str) -> str:
    return f"{year}_{round_num}_{session}"


class SessionMeta(BaseModel):
    session_key: str
    year: int
    round: int
    event_name: str  # "Bahrain Grand Prix"
    session_type: str  # FP1 | FP2 | FP3 | Q | SQ | SS | S | R
    circuit: str
    country: str | None = None
    date_utc: datetime | None = None
    total_laps: int | None = None
