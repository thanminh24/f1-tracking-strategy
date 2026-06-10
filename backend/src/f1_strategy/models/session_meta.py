"""Session identity + metadata. session_key format: '{year}_{round}_{session}'."""

from datetime import datetime

from pydantic import BaseModel


def make_session_key(year: int, round_num: int, session: str) -> str:
    return f"{year}_{round_num}_{session}"


def parse_session_key(session_key: str) -> tuple[int, int, str]:
    """Parse '{year}_{round}_{session}' and raise ValueError for malformed keys."""
    parts = session_key.split("_")
    if len(parts) != 3:
        raise ValueError(f"invalid session_key: {session_key}")
    year, round_num, session = parts
    if not year.isdigit() or not round_num.isdigit() or not session:
        raise ValueError(f"invalid session_key: {session_key}")
    return int(year), int(round_num), session.upper()


def canonical_session_key(session_key: str) -> str:
    year, round_num, session = parse_session_key(session_key)
    return make_session_key(year, round_num, session)


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
