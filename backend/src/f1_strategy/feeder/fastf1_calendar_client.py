"""FastF1-backed F1 calendar: all rounds for any season 2018–present.

Merges remote FastF1 schedule with local DuckDB availability so the frontend
can show every round regardless of ingest state. First call per year takes
~2–5s (FastF1 disk cache); subsequent calls return from in-memory TTL cache.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import partial

log = logging.getLogger(__name__)

_CACHE: dict[int, tuple[datetime, list]] = {}
_CACHE_TTL = timedelta(hours=1)
_CACHE_LOCK = asyncio.Lock()


@dataclass
class CalendarEvent:
    round: int
    event_name: str
    circuit: str | None
    country: str | None
    session_types: list[str]
    local: bool
    first_session_utc: str | None


def _fetch_year_sync(year: int) -> list[CalendarEvent]:
    """Synchronous FastF1 call — must be run in an executor."""
    import fastf1
    import pandas as pd

    schedule = fastf1.get_event_schedule(year, include_testing=False)
    events: list[CalendarEvent] = []

    for _, row in schedule.iterrows():
        round_num = int(row.get("RoundNumber", 0))
        if round_num <= 0:
            continue

        session_types: list[str] = []
        for i in range(1, 6):
            col = f"Session{i}"
            if col in row and pd.notna(row[col]) and str(row[col]).strip():
                session_types.append(str(row[col]).strip())

        # FastF1 "Location" is the circuit short name (e.g. "Barcelona")
        circuit = str(row.get("Location", "") or row.get("Country", "") or "")
        country = str(row.get("Country", "") or "")
        event_name = str(row.get("EventName", "") or "")

        # First session date from Session1Date column
        first_dt: str | None = None
        date_col = "Session1Date" if "Session1Date" in row else "EventDate"
        if date_col in row and pd.notna(row[date_col]):
            raw = row[date_col]
            if hasattr(raw, "isoformat"):
                first_dt = raw.isoformat()
            else:
                first_dt = str(raw)

        events.append(
            CalendarEvent(
                round=round_num,
                event_name=event_name,
                circuit=circuit or None,
                country=country or None,
                session_types=session_types,
                local=False,  # merged with DuckDB below
                first_session_utc=first_dt,
            )
        )

    events.sort(key=lambda e: e.round)
    return events


async def get_calendar(year: int) -> list[CalendarEvent]:
    """Return all F1 rounds for year with local availability flag.

    Falls back to local-only data if FastF1 is unavailable.
    Lock is released before the slow FastF1 executor call so concurrent
    requests for different years don't serialize unnecessarily.
    """
    from f1_strategy.archive import queries  # avoid circular at module level

    now = datetime.now(UTC)

    # Fast path: return cached value without holding the lock during fetch
    async with _CACHE_LOCK:
        cached = _CACHE.get(year)
        if cached and (now - cached[0]) < _CACHE_TTL:
            return cached[1]

    # Slow path: fetch outside the lock (2-5s FastF1 call)
    loop = asyncio.get_running_loop()
    try:
        events = await loop.run_in_executor(None, partial(_fetch_year_sync, year))
    except Exception as exc:
        log.warning("fastf1_calendar_client: FastF1 fetch failed for %d: %s", year, exc)
        # Fallback: serve local events only
        try:
            df = queries.list_events(year)
            events = [
                CalendarEvent(
                    round=int(row["round"]),
                    event_name=str(row.get("event_name", "")),
                    circuit=row.get("circuit"),
                    country=row.get("country"),
                    session_types=list(row.get("session_types", [])),
                    local=True,
                    first_session_utc=None,
                )
                for row in df.to_dict(orient="records")
            ]
        except Exception:
            events = []
        async with _CACHE_LOCK:
            _CACHE[year] = (now, events)
        return events

    # Merge with local DuckDB availability
    try:
        local_df = queries.list_events(year)
        local_rounds: set[int] = set(local_df["round"].astype(int).tolist())
    except Exception:
        local_rounds = set()

    for event in events:
        event.local = event.round in local_rounds

    async with _CACHE_LOCK:
        _CACHE[year] = (now, events)
    return events
