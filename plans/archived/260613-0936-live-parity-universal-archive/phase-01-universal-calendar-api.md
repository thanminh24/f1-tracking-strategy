---
phase: 1
title: "Universal Calendar API"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Universal Calendar API

## Overview

`list_events(year)` queries DuckDB only — users see only locally-ingested sessions. Add a FastF1-backed `/api/calendar/{year}` endpoint that returns every F1 round for any season 2018–present, each with a `local: bool` flag. Update the archive browser to call this new endpoint so ALL rounds are discoverable and any session can be opened via `ensure_session`.

## Requirements

- **Functional:**
  - New `GET /api/calendar/{year}` returns all rounds merged with local availability
  - Each event: `round`, `event_name`, `circuit`, `country`, `session_types`, `local: bool`
  - `session_types` from FastF1 `Session1`–`Session5` columns (varies by year, sprint weekends included)
  - Rounds in DuckDB → `local: true`; remote-only → `local: false`
  - Archive browser calls calendar endpoint, shows ALL rounds with a remote indicator for non-local
  - Year chips show 2018–present client-side; no server round-trip for year list

- **Non-functional:**
  - 1h in-memory TTL cache (same pattern as `livef1_schedule_client`)
  - FastF1 disk cache handles repeated cold starts automatically
  - Fallback: FastF1 failure → serve local-only rows with `local=True`, log warning, no 500

## Architecture

```
GET /api/calendar/{year}
  → fastf1_calendar_client.get_calendar(year)
      → run_in_executor(_fetch_year_sync, year)   # FastF1 sync call
      → merge with queries.list_events(year)       # DuckDB local check
      → return list[CalendarEvent]

CalendarEvent {
  round: int
  event_name: str
  circuit: str | None
  country: str | None
  session_types: list[str]  # ["FP1","FP2","FP3","Q","R"] or sprint variant
  local: bool
  first_session_utc: str | None
}
```

Archive browser: replaces `api.events(year)` with `api.calendar(year)`. Ensure flow unchanged.

## Related Code Files

- Create: `backend/src/f1_strategy/feeder/fastf1_calendar_client.py`
- Modify: `backend/src/f1_strategy/api/routes_archive.py` — add `GET /api/calendar/{year}`
- Modify: `frontend/lib/api-client.ts` — add `calendar()` + `CalendarEvent` type
- Modify: `frontend/components/home/archive-browser.tsx` — use calendar, show local badge, static years
- Modify: `frontend/app/page.tsx` — remove server-fetched seasons/events, pass static year range

## Implementation Steps

1. **Create `fastf1_calendar_client.py`**:
   - Module-level `_CACHE: dict[int, tuple[datetime, list]]`, `_CACHE_TTL = timedelta(hours=1)`, `_CACHE_LOCK = asyncio.Lock()`
   - `@dataclass CalendarEvent` with fields above
   - `_fetch_year_sync(year: int) -> list[CalendarEvent]`: calls `fastf1.get_event_schedule(year, include_testing=False)`, iterates DataFrame, maps `Session1`–`Session5` to `session_types` (skip NaN/empty), maps `RoundNumber`, `EventName`, `Location`, `Country`
   - `async get_calendar(year: int) -> list[CalendarEvent]`: cache check → executor call → merge local → return

2. **Merge local availability in `get_calendar()`**: call `queries.list_events(year)` (sync, cheap), build `set[int]` of local rounds, set `event.local = True` for matches. On FastF1 failure, serve local events with `local=True`.

3. **Add route in `routes_archive.py`**:
   ```python
   @router.get("/calendar/{year}")
   async def calendar(year: int) -> list[dict]:
       from dataclasses import asdict
       from f1_strategy.feeder.fastf1_calendar_client import get_calendar
       return [asdict(e) for e in await get_calendar(year)]
   ```

4. **Add `api.calendar()` in `api-client.ts`**:
   ```typescript
   export interface CalendarEvent {
     round: number; event_name: string; circuit: string | null;
     country: string | null; session_types: string[];
     local: boolean; first_session_utc: string | null;
   }
   calendar: (year: number) => getJson<CalendarEvent[]>(`/api/calendar/${year}`),
   ```

5. **Update `archive-browser.tsx`**:
   - Replace `api.events(newYear)` → `api.calendar(newYear)` and `EventRow` → `CalendarEvent`
   - For `local: false` rounds add a faint `↓` icon after the round label
   - Generate year chips client-side: `Array.from({length: new Date().getFullYear()-2017}, (_, i) => new Date().getFullYear() - i)`, remove `seasons` prop

6. **Update `page.tsx`**: remove `api.events()` server prefetch; pass `initialEvents=[]` and omit seasons prop (browser generates them).

## Success Criteria

- [ ] `GET /api/calendar/2026` returns all 24 rounds (not just locally-ingested)
- [ ] `GET /api/calendar/2023` returns correct rounds/session_types
- [ ] `local: true` for DuckDB rounds, `local: false` for remote-only
- [ ] Archive browser shows all rounds; remote-only show download indicator
- [ ] Clicking remote-only session triggers ensure flow → navigates on success
- [ ] FastF1 unavailable → local-only fallback, no 500

## Risk Assessment

- **FastF1 cold start ~2–5s**: mitigated by in-memory TTL cache; only first request after restart.
- **Sprint naming**: FastF1 uses `Sprint Qualifying` / `Sprint` — display verbatim in pills, consistent with existing archive UI.
- **Pre-2018 years**: FastF1 calendar starts at 2018; hard-code lower bound in year chip generation.
