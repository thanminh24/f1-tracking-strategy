"""F1 session schedule via the livef1 package (F1 official livetiming + Jolpica).

No API key required. Uses livef1's Season/Meeting data which pulls from
livetiming.formula1.com — same source as the official timing screens.

get_season() is synchronous and takes ~8s on first call; results are cached
with a 30-minute TTL so subsequent API requests return instantly.

IMPORTANT: livef1 package session times may be local time (not UTC). The
_fetch_year_sync fallback assumes times are UTC; use _detect_from_livetiming()
for accurate detection which correctly handles GmtOffset.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from functools import partial

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level TTL cache (year → (fetched_at, list[ScheduledSession]))
# ---------------------------------------------------------------------------
_CACHE: dict[int, tuple[datetime, list]] = {}
_CACHE_TTL = timedelta(minutes=30)
_CACHE_LOCK = asyncio.Lock()

_LIVETIMING_SESSION_INFO_URL = (
    "https://livetiming.formula1.com/static/SessionInfo.json"
)

# Cache the livetiming probe result (short TTL during active sessions)
_LT_CACHE: tuple[datetime, "ScheduledSession | None"] | None = None
_LT_CACHE_TTL = timedelta(seconds=60)  # probe every 60s during weekends


def _parse_gmt_offset(gmt_offset: str) -> timedelta:
    """Parse '02:00:00' into timedelta."""
    try:
        parts = gmt_offset.split(":")
        h, m = int(parts[0]), int(parts[1])
        return timedelta(hours=h, minutes=m)
    except Exception:
        return timedelta(0)


def _detect_from_livetiming() -> "ScheduledSession | None":
    """Probe livetiming.formula1.com/static/SessionInfo.json.

    Returns a ScheduledSession when the session window is active (now is
    between UTC start and UTC end ± 15 min grace), regardless of SessionStatus
    field which can lag the actual broadcast start.
    """
    global _LT_CACHE
    now = datetime.now(UTC)

    if _LT_CACHE is not None:
        fetched_at, cached = _LT_CACHE
        if now - fetched_at < _LT_CACHE_TTL:
            return cached

    try:
        import requests
        r = requests.get(_LIVETIMING_SESSION_INFO_URL, timeout=5)
        if r.status_code != 200:
            _LT_CACHE = (now, None)
            return None

        import json
        raw = r.content.decode("utf-8-sig")
        info = json.loads(raw)

        # Parse local start/end + offset to get UTC times
        gmt_offset = _parse_gmt_offset(info.get("GmtOffset", "00:00:00"))
        raw_start = info.get("StartDate")
        raw_end = info.get("EndDate")

        def parse_local_to_utc(s: str) -> datetime | None:
            if not s:
                return None
            try:
                local = datetime.fromisoformat(s)
                if local.tzinfo is None:
                    local = local.replace(tzinfo=timezone.utc) - gmt_offset
                return local.astimezone(UTC)
            except Exception:
                return None

        utc_start = parse_local_to_utc(raw_start)
        utc_end = parse_local_to_utc(raw_end)

        if utc_start is None or utc_end is None:
            _LT_CACHE = (now, None)
            return None

        # Active window: within session + 15min grace on each side
        grace = timedelta(minutes=15)
        if not (utc_start - grace <= now <= utc_end + grace):
            _LT_CACHE = (now, None)
            return None

        meeting = info.get("Meeting", {})
        circuit_info = meeting.get("Circuit", {})
        circuit = circuit_info.get("ShortName") or meeting.get("Location")
        country = meeting.get("OfficialName") or meeting.get("Name")
        session_type = info.get("Name")  # "Practice 3", "Qualifying", etc.
        session_key = int(info.get("Key", 0))

        if utc_start <= now <= utc_end:
            status = "active"
        elif now < utc_start:
            status = "upcoming"
        else:
            status = "recent"

        result = ScheduledSession(
            session_key=session_key,
            circuit=circuit,
            country=country,
            session_type=session_type,
            date_start=utc_start,
            date_end=utc_end,
            status=status,
        )
        _LT_CACHE = (now, result)
        return result

    except Exception as exc:
        log.warning("livetiming probe failed: %s", exc)
        _LT_CACHE = (now, None)
        return None


@dataclass
class ScheduledSession:
    session_key: int
    circuit: str | None          # short name, e.g. "Catalunya"
    country: str | None          # full event name, e.g. "Barcelona Grand Prix"
    session_type: str | None     # "Practice 1", "Qualifying", "Race", etc.
    date_start: datetime | None
    date_end: datetime | None
    status: str                  # "active" | "upcoming" | "recent"


def _fetch_year_sync(year: int) -> list[ScheduledSession]:
    """Synchronous livef1 call — must be run in an executor."""
    import livef1

    season = livef1.get_season(year)
    mt = season.meetings_table  # DataFrame: Meeting Key, Meeting Name, Meeting Circuit Shortname, …

    results: list[ScheduledSession] = []
    for meeting in season.meetings:
        st = meeting.sessions_table
        if st is None or len(st) == 0:
            continue

        # Resolve circuit name from meetings_table
        meeting_keys = st["meeting_key"].unique().tolist()
        circuit: str | None = None
        country: str | None = None
        for mk in meeting_keys:
            rows = mt[mt["Meeting Key"] == mk]
            if not rows.empty:
                circuit = (
                    rows.iloc[0].get("Meeting Circuit Shortname")
                    or rows.iloc[0].get("Meeting Name")
                )
                country = rows.iloc[0].get("Meeting Name")
                break

        for sess_key, row in st.iterrows():
            raw_start = row.get("session_startDate")
            raw_end = row.get("session_endDate")

            # pandas Timestamp → python datetime
            if hasattr(raw_start, "to_pydatetime"):
                raw_start = raw_start.to_pydatetime()
            if hasattr(raw_end, "to_pydatetime"):
                raw_end = raw_end.to_pydatetime()

            # Ensure UTC-aware
            if raw_start is not None and raw_start.tzinfo is None:
                raw_start = raw_start.replace(tzinfo=UTC)
            if raw_end is not None and raw_end.tzinfo is None:
                raw_end = raw_end.replace(tzinfo=UTC)

            results.append(ScheduledSession(
                session_key=int(sess_key) if str(sess_key).lstrip("-").isdigit() else 0,
                circuit=circuit,
                country=country,
                session_type=row.get("session_name"),
                date_start=raw_start,
                date_end=raw_end,
                status="unknown",  # resolved in get_schedule()
            ))

    results.sort(key=lambda s: s.date_start or datetime.min.replace(tzinfo=UTC))
    return results


async def _load_year(year: int) -> list[ScheduledSession]:
    """Return cached schedule for year, refreshing if stale."""
    now = datetime.now(UTC)
    async with _CACHE_LOCK:
        if year in _CACHE:
            fetched_at, sessions = _CACHE[year]
            if now - fetched_at < _CACHE_TTL:
                return sessions
        # Fetch in executor so we don't block the event loop
        loop = asyncio.get_event_loop()
        try:
            sessions = await loop.run_in_executor(None, partial(_fetch_year_sync, year))
        except Exception as exc:
            log.warning("livef1 schedule fetch failed for %d: %s", year, exc)
            sessions = _CACHE.get(year, (None, []))[1]  # serve stale on error
        _CACHE[year] = (now, sessions)
        return sessions


async def get_schedule(window_back_h: int = 4, window_fwd_h: int = 48) -> list[ScheduledSession]:
    """Return sessions in the window [now - back_h, now + fwd_h] with resolved status.

    Merges the livetiming probe result with the livef1 schedule so the live
    session always appears even when the schedule timestamps are off.
    """
    year = datetime.now(UTC).year
    now = datetime.now(UTC)
    back = now - timedelta(hours=window_back_h)
    fwd = now + timedelta(hours=window_fwd_h)

    # Probe livetiming first; include result even if schedule times are off
    loop = asyncio.get_event_loop()
    lt_session = await loop.run_in_executor(None, _detect_from_livetiming)

    all_sessions = await _load_year(year)

    result: list[ScheduledSession] = []
    for s in all_sessions:
        ds = s.date_start
        de = s.date_end

        # Keep only sessions in the window
        if ds is not None and ds > fwd:
            continue
        if de is not None and de < back:
            continue
        if ds is None and de is None:
            continue

        # Resolve status
        if ds and ds > now:
            status = "upcoming"
        elif de and de < now:
            status = "recent"
        else:
            status = "active"

        result.append(ScheduledSession(
            session_key=s.session_key,
            circuit=s.circuit,
            country=s.country,
            session_type=s.session_type,
            date_start=s.date_start,
            date_end=s.date_end,
            status=status,
        ))

    # Merge livetiming probe — override status for matching session (corrects timezone bugs)
    if lt_session is not None:
        merged = False
        for i, s in enumerate(result):
            if s.session_key == lt_session.session_key:
                # Replace with correctly timezone-corrected entry from livetiming
                result[i] = lt_session
                merged = True
                break
        if not merged:
            result.append(lt_session)

    return result


def get_schedule_sync(window_back_h: int = 4, window_fwd_h: int = 48) -> list[ScheduledSession]:
    """Synchronous schedule lookup for worker threads that cannot await."""
    year = datetime.now(UTC).year
    now = datetime.now(UTC)
    back = now - timedelta(hours=window_back_h)
    fwd = now + timedelta(hours=window_fwd_h)

    if year in _CACHE:
        fetched_at, all_sessions = _CACHE[year]
        if now - fetched_at >= _CACHE_TTL:
            all_sessions = _fetch_year_sync(year)
            _CACHE[year] = (now, all_sessions)
    else:
        all_sessions = _fetch_year_sync(year)
        _CACHE[year] = (now, all_sessions)

    result: list[ScheduledSession] = []
    for s in all_sessions:
        ds = s.date_start
        de = s.date_end
        if ds is not None and ds > fwd:
            continue
        if de is not None and de < back:
            continue
        if ds is None and de is None:
            continue

        if ds and ds > now:
            status = "upcoming"
        elif de and de < now:
            status = "recent"
        else:
            status = "active"

        result.append(ScheduledSession(
            session_key=s.session_key,
            circuit=s.circuit,
            country=s.country,
            session_type=s.session_type,
            date_start=s.date_start,
            date_end=s.date_end,
            status=status,
        ))
    return result


def get_current_session_sync() -> ScheduledSession | None:
    """Return active session for worker-thread callers, or latest recent session."""
    # Livetiming probe first (most accurate)
    lt_session = _detect_from_livetiming()
    if lt_session and lt_session.status == "active":
        return lt_session

    try:
        sessions = get_schedule_sync()
    except Exception as exc:
        log.warning("livef1 sync schedule fetch failed: %s", exc)
        return None

    active = [s for s in sessions if s.status == "active"]
    if active:
        return max(active, key=lambda s: s.date_start or datetime.min.replace(tzinfo=UTC))

    recent = [s for s in sessions if s.status == "recent"]
    if recent:
        return max(
            recent,
            key=lambda s: s.date_end or s.date_start or datetime.min.replace(tzinfo=UTC),
        )
    return None


async def get_current_session() -> ScheduledSession | None:
    """Return the currently active session, or None if off-weekend.

    Primary: probe livetiming.formula1.com/static/SessionInfo.json which
    gives correct local→UTC conversion via GmtOffset. Fallback: livef1
    package schedule (may have timezone offset issues).
    """
    # Fast livetiming probe first — runs in executor to avoid blocking loop
    loop = asyncio.get_event_loop()
    lt_session = await loop.run_in_executor(None, _detect_from_livetiming)
    if lt_session and lt_session.status == "active":
        return lt_session

    # Fallback: livef1 package schedule
    sessions = await get_schedule()
    active = [s for s in sessions if s.status == "active"]
    if not active:
        return None
    return max(active, key=lambda s: s.date_start or datetime.min.replace(tzinfo=UTC))
