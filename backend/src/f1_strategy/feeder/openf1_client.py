"""Async HTTP client for the OpenF1 public API (https://openf1.org).

Completely free, no authentication, no API key. Polls at ~1s cadence.
Backs off on HTTP 429 per Retry-After header.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx
from pydantic import BaseModel, ConfigDict

BASE = "https://api.openf1.org/v1"
log = logging.getLogger(__name__)


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class OF1Position(_Base):
    driver_number: int
    position: int | None = None
    lap_number: int | None = None
    x: float | None = None
    y: float | None = None


class OF1Stint(_Base):
    driver_number: int
    compound: str | None = None
    lap_start: int | None = None
    lap_end: int | None = None
    stint_number: int = 1
    tyre_age_at_start: int = 0


class OF1Pit(_Base):
    driver_number: int
    lap_number: int | None = None


class OF1RaceControl(_Base):
    message: str = ""
    flag: str | None = None
    category: str | None = None
    lap_number: int | None = None


class OF1Driver(_Base):
    driver_number: int
    name_acronym: str | None = None
    team_name: str | None = None


class OF1Session(_Base):
    session_key: int
    session_type: str | None = None
    year: int | None = None
    circuit_short_name: str | None = None
    date_start: str | None = None
    date_end: str | None = None
    country_name: str | None = None


class OpenF1Client:
    def __init__(self) -> None:
        self._http = httpx.AsyncClient(
            base_url=BASE,
            timeout=10.0,
            follow_redirects=True,
            headers={"Accept": "application/json"},
        )

    async def _get(self, path: str, **params: object) -> list[dict]:
        """GET with 429-backoff. Returns [] on any network/HTTP error."""
        try:
            r = await self._http.get(path, params={k: v for k, v in params.items() if v is not None})
            if r.status_code == 429:
                delay = int(r.headers.get("Retry-After", "5"))
                log.warning("OpenF1 429 on %s — sleeping %ds", path, delay)
                await asyncio.sleep(delay)
                r = await self._http.get(path, params=params)
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, list) else []
        except httpx.HTTPError as exc:
            log.warning("OpenF1 fetch failed %s: %s", path, exc)
            return []

    def _parse_list(self, model: type, rows: list[dict]) -> list:
        out = []
        for row in rows:
            try:
                out.append(model.model_validate(row))
            except Exception:
                pass
        return out

    async def positions(self, session_key: int) -> list[OF1Position]:
        """Latest position per driver (keyed by driver_number)."""
        rows = await self._get("/position", session_key=session_key)
        # keep latest entry per driver (OpenF1 returns all historical positions)
        by_driver: dict[int, OF1Position] = {}
        for row in rows:
            try:
                p = OF1Position.model_validate(row)
                prev = by_driver.get(p.driver_number)
                if prev is None or (p.lap_number or 0) >= (prev.lap_number or 0):
                    by_driver[p.driver_number] = p
            except Exception:
                pass
        return list(by_driver.values())

    async def stints(self, session_key: int) -> list[OF1Stint]:
        rows = await self._get("/stints", session_key=session_key)
        return self._parse_list(OF1Stint, rows)

    async def pit(self, session_key: int) -> list[OF1Pit]:
        rows = await self._get("/pit", session_key=session_key)
        return self._parse_list(OF1Pit, rows)

    async def race_control(self, session_key: int) -> list[OF1RaceControl]:
        rows = await self._get("/race_control", session_key=session_key)
        return self._parse_list(OF1RaceControl, rows)

    async def drivers(self, session_key: int) -> list[OF1Driver]:
        rows = await self._get("/drivers", session_key=session_key)
        return self._parse_list(OF1Driver, rows)

    async def sessions(self, **filters: object) -> list[OF1Session]:
        rows = await self._get("/sessions", **filters)
        return self._parse_list(OF1Session, rows)

    async def current_live_session(self) -> OF1Session | None:
        """Return the currently active session (any type: Race, Practice, Qualifying).

        Looks back 4h to stay "current" through red-flag delays and between sessions.
        Prefers a session that started most recently so Practice 1 doesn't override
        an ongoing Practice 2 on the same day.
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=4)).strftime("%Y-%m-%d")
        sessions = await self.sessions(date_start=f">={cutoff}")
        if not sessions:
            return None
        # Most recently started session first
        sessions.sort(key=lambda s: s.session_key, reverse=True)
        return sessions[0]

    async def current_race_session(self) -> OF1Session | None:
        """Return the ongoing or most recent Race session only. Use current_live_session
        for practice/qualifying."""
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=4)).strftime("%Y-%m-%d")
        sessions = await self.sessions(session_type="Race", date_start=f">={cutoff}")
        if not sessions:
            return None
        return sessions[-1]

    async def find_session(self, year: int, round_number: int, session_type: str = "Race") -> OF1Session | None:
        """Resolve an archived session by F1 year + round + session type."""
        sessions = await self.sessions(year=year, session_type=session_type)
        sessions.sort(key=lambda s: s.session_key)
        if round_number <= len(sessions):
            return sessions[round_number - 1]
        return None

    async def close(self) -> None:
        await self._http.aclose()
