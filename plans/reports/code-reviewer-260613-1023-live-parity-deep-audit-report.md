# Code Review: Live Parity + Universal Calendar (Ph1–Ph5)

**Reviewer:** code-reviewer  
**Date:** 2026-06-13  
**Branch:** main  
**Scope:** Ph1–Ph5 live-parity + universal calendar implementation

---

## Scope

- `backend/src/f1_strategy/feeder/fastf1_calendar_client.py`
- `backend/src/f1_strategy/archive/telemetry_service.py`
- `backend/src/f1_strategy/api/routes_archive.py`
- `backend/src/f1_strategy/feeder/livef1_feeder.py`
- `backend/src/f1_strategy/feeder/session_registry.py`
- `backend/src/f1_strategy/models/race_state.py`
- `frontend/lib/api-client.ts`
- `frontend/lib/use-track-geo.ts`
- `frontend/lib/live-telemetry-store.ts`
- `frontend/lib/feeder-client.ts`
- `frontend/lib/types.ts`
- `frontend/components/track-map.tsx`
- `frontend/components/telemetry/telemetry-view.tsx`
- `frontend/components/home/archive-browser.tsx`

**LOC changed:** ~800 Python, ~600 TypeScript  
**Focus:** Correctness edge cases, type safety, security, performance, regressions

---

## Overall Assessment

Solid implementation of live GPS dots + circuit-level track outline + FastF1 calendar. Core data flow is correct. Found 2 blockers, 4 warnings, 5 minor issues. No auth or PII exposure concerns (tool is internal, no user data).

---

## Critical Issues (Blockers) 🔴

### B1 — `_apply_race_control()` sets `lap` to driver car number

**File:** `backend/src/f1_strategy/feeder/livef1_feeder.py:413`

```python
lap = rec.get("Lap") or rec.get("lap_number") or rec.get("RacingNumber")
```

`RacingNumber` is the driver's car number (e.g. `"33"` for Verstappen), not a lap number. When the F1 stream sends a Race Control message without a `"Lap"` field (common for penalty/DRS decisions), `lap` will be set to the driver's car number (e.g. 33) and shown in the UI as the lap number. This corrupts every RC message that lacks an explicit lap counter.

**Fix:** Remove `rec.get("RacingNumber")` from the lap fallback chain:
```python
lap = rec.get("Lap") or rec.get("lap_number")
```

---

### B2 — `get_track_outline()` and `get_lap_telemetry()` call `session_key.split("_")` without error handling

**File:** `backend/src/f1_strategy/archive/telemetry_service.py:40,68`

Both functions do `year, round_num, code = session_key.split("_")` with no try/except. If `session_key` has fewer than 2 underscores (e.g. `"live"`, `"2024"`, or any malformed input), this raises `ValueError` which propagates unguarded. The route handlers wrap these in `try/except Exception` and return 404, so it doesn't crash — but the split on `get_track_outline` is inside a function decorated with `@lru_cache` on the inner `_load_session`. A `ValueError` on bad session key won't be caught until the route handler, which is fine. **However**, the `_cache_path()` function (line 29) uses `session_key` **directly in a filesystem path**:

```python
d = get_settings().telemetry_cache_dir / session_key
```

If `session_key = ".."`, pathlib resolves this to the **parent** of `telemetry_cache_dir`:

```
/data/telemetry_cache/.. → /data
```

FastAPI's Starlette routing normalizes URLs so `/api/sessions/../track-outline` is rejected at the HTTP level. But this relies on URL normalization as the only guard — no explicit validation at the function boundary. If `session_key` ever comes from an internal source (DB, config) rather than a URL path param, the guard vanishes.

**Fix:** Validate `session_key` format at function entry:
```python
import re
_SESSION_KEY_RE = re.compile(r"^\d{4}_\d{1,2}_[A-Z0-9]+$")

def get_track_outline(session_key: str) -> pd.DataFrame:
    if not _SESSION_KEY_RE.match(session_key):
        raise ValueError(f"invalid session_key: {session_key!r}")
    ...
```

---

## High Priority (Warnings) 🟡

### W1 — `_CACHE_LOCK` held during 2–5s FastF1 executor call serializes all concurrent calendar requests

**File:** `backend/src/f1_strategy/feeder/fastf1_calendar_client.py:89–129`

The `asyncio.Lock()` is acquired at the start of `get_calendar()` and held for the entire `run_in_executor()` call. FastF1's `get_event_schedule()` takes 2–5s on a cold cache. During this window, every other `GET /api/calendar/{year}` request blocks — including requests for **different years**. The lock is global (not per-year), so concurrent year requests like `calendar(2024)` and `calendar(2023)` serialize unnecessarily.

**Fix:** Use per-year locks or release the global lock around the executor call and re-check the cache after reacquiring:
```python
async def get_calendar(year: int) -> list[CalendarEvent]:
    async with _CACHE_LOCK:
        if (cached := _CACHE.get(year)) and (now - cached[0]) < _CACHE_TTL:
            return cached[1]
    # Release lock during slow fetch
    try:
        events = await asyncio.get_running_loop().run_in_executor(...)
    except Exception:
        ...
    async with _CACHE_LOCK:
        _CACHE[year] = (now, events)
        return events
```

Also: use `asyncio.get_running_loop()` instead of `asyncio.get_event_loop()` (deprecated in 3.10+, though currently still works from a coroutine context on Python 3.13).

---

### W2 — `buildGeo()` division by zero when all outline points are identical

**File:** `frontend/lib/use-track-geo.ts:58`

```typescript
const scale = (VIEWBOX - PAD * 2) / Math.max(maxX - minX, maxY - minY);
```

JavaScript division by zero produces `Infinity`, so `norm` points get `x = NaN` or `±Infinity`. SVG `path` elements with these coords render as broken/invisible shapes. The `points.length < 10` guard (line 117) prevents this for very sparse data but not for 15+ identical points (e.g. a FastF1 session where position data is empty/zero-filled).

**Fix:**
```typescript
const range = Math.max(maxX - minX, maxY - minY);
if (range < 0.001) return null;  // degenerate outline
const scale = (VIEWBOX - PAD * 2) / range;
```

---

### W3 — Telemetry broadcast sends full 300-sample ring buffer snapshot every 1Hz tick

**File:** `backend/src/f1_strategy/feeder/session_registry.py:49–53`

`get_telemetry()` returns all non-empty driver buffers (up to 20 drivers × 300 samples × ~100 bytes JSON ≈ **600 KB per broadcast**). At 1Hz this is ~600 KB/s per connected client. With multiple subscribers (QUEUE_MAX=60 protects against OOM but not bandwidth), this can overwhelm slow clients.

The frontend `setAll()` replaces the entire store on every tick, so only the latest snapshot is needed anyway. Sending incremental samples would reduce broadcast to ~20 drivers × ~4 new samples × 100 bytes = **~8 KB/tick**.

**Fix (backend):** Send only the last N new samples per driver (track a `_telemetry_sent` cursor per driver). Or truncate to last 60 samples for the broadcast while keeping the full 300-sample deque for local analytics.

**Fix (frontend):** If full snapshots are kept, use `useLiveTelemetryStore((s) => s.data[primaryCarId])` selector instead of `(s) => s.data` to avoid re-rendering all drivers on each tick.

---

### W4 — `InPit` string `"false"` treated as truthy — phantom pit stop counted

**File:** `backend/src/f1_strategy/feeder/livef1_feeder.py:335`

```python
in_pit_now = bool(rec.get("InPit") or rec.get("in_pit"))
```

If the F1 stream sends `"InPit": "false"` (non-empty string), `bool("false") == True`. The pit-transition counter at line 337–338 would increment `_pit_stops[dn]` incorrectly. Though the F1 official stream typically sends booleans or 0/1 integers, the `livef1` adapter may normalize differently.

**Fix:**
```python
in_pit_raw = rec.get("InPit") ?? rec.get("in_pit")
in_pit_now = in_pit_raw not in (None, False, 0, "0", "false", "False")
```

---

## Medium Priority 🟠

### M1 — `get_track_outline()` does not call `_extract_outline_from_session()` — DRY violation

**File:** `backend/src/f1_strategy/archive/telemetry_service.py:70–77` vs `81–88`

`get_track_outline()` duplicates the fastest-lap extraction logic that was already factored into `_extract_outline_from_session()`. `get_circuit_outline()` correctly uses the helper; `get_track_outline()` does not. Refactor to call the shared helper.

---

### M2 — `feeder-client.ts` JSON.parse without try/catch crashes the WS handler

**File:** `frontend/lib/feeder-client.ts:33`

```typescript
const msg: WsMessage = JSON.parse(ev.data);
```

If the server sends a non-JSON message (network glitch, partial frame), `JSON.parse` throws, which propagates uncaught through `ws.onmessage`. The browser logs an unhandled error but the WS connection stays open receiving subsequent messages. In practice this is benign, but it's a hygiene issue.

**Fix:**
```typescript
try {
  const msg: WsMessage = JSON.parse(ev.data);
  // ... dispatch
} catch {
  log.warn("ws: ignoring non-JSON message");
}
```

---

### M3 — Live telemetry polling in `TelemetryView` calls `api.laps()` but discards the result

**File:** `frontend/components/telemetry/telemetry-view.tsx:188–194`

```typescript
const poll = async () => {
  try {
    await api.laps(sessionKey);  // result discarded
  } catch (err) { ... }
};
liveSessionPollRef.current = setInterval(poll, 10000);
```

The response is never used. This fires an HTTP GET to `/api/sessions/live/laps` every 10s as a keepalive or incomplete feature. Either implement the polling (update laps state) or remove it.

---

### M4 — `geoCache` and `pointsCache` grow unboundedly (module-level Maps, never evicted)

**File:** `frontend/lib/use-track-geo.ts:26,95`

Both caches are module-level Maps with no size limit or TTL. For a user browsing many seasons (20+ sessions), these accumulate indefinitely. Track outlines are ~800 points × 2 fields × 8 bytes ≈ 12 KB each. At 50 sessions this is ~600 KB — acceptable but worth capping with a simple LRU (or just a `Map` with max 20 entries).

---

### M5 — `rc_messages` trim limits are inconsistent across handlers

**File:** `backend/src/f1_strategy/feeder/livef1_feeder.py:375,420`

`_apply_track_status()` trims to 10 messages; `_apply_race_control()` trims to 20. Messages from both handlers go into the same `_rc_messages` list. The practical limit is determined by whichever handler last trimmed. Use a consistent limit in one place (e.g. `_rc_messages = self._rc_messages[-20:]` in `_build_state()`).

---

## Low Priority / Minor 🟢

### L1 — `_decompress_z()` passes non-dict, non-str, non-bytes inputs to `bytes()`

**File:** `backend/src/f1_strategy/feeder/livef1_feeder.py:262–264`

```python
b = base64.b64decode(raw) if isinstance(raw, str) else bytes(raw)
```

`bytes(42)` creates `b'\x00' * 42` (integer → null-byte buffer). `bytes([1, 2, 3])` succeeds but decompresses to garbage. These inputs are caught by the outer `try/except` at line 205 (`log.debug`) — so no crash, but the error message is misleading. Add explicit type guard for clarity.

---

### L2 — `extractCircuitFromKey("live")` returns `"Live"` — circuit outline 404 on live session

**File:** `frontend/app/session/[key]/session-dashboard.tsx:122–127`

For `sessionKey = "live"`, `extractCircuitFromKey` returns `"Live"`. `TrackMap` then fetches `GET /api/circuits/Live/track-outline` which 404s (no circuit named "Live" in FastF1 schedule). Result: permanent skeleton shown on live TrackMap. The actual circuit name is available from `api.liveSession()` but not threaded through to `TrackMap`. This is a known UX gap but worth flagging.

**Fix:** Fetch `api.liveSession()` in `SessionDashboard` and pass the `circuit` field to `TrackMap` instead of deriving it from the key.

---

### L3 — Stale geo cache on `sessionKey` prop change (low-probability race)

**File:** `frontend/lib/use-track-geo.ts:116–126`

When `sessionKey` changes on a mounted `TrackMap` (not a remount — e.g. `circuit` prop changes on the live dashboard), `useMemo` runs with old `points` state and the new `sessionKey`. If old points had ≥ 10 entries, `buildGeo(oldPoints)` is cached under the new `sessionKey` key. Subsequent renders after the correct points load find the stale cached geo and never update.

**Mitigated by:** `TrackMap` only appears in `session-dashboard.tsx`, which remounts on Next.js page navigation. Bug only manifests if `circuit` prop changes while the component stays mounted. Low probability in current flow; worth a guard anyway:

```typescript
// In useMemo, before building:
if (!pointsCache.has(sessionKey)) return null;  // wait for correct data
```

---

### L4 — `abbr()` fallback in archive-browser returns full session type name for unknown sessions

**File:** `frontend/components/home/archive-browser.tsx:19`

```typescript
function abbr(name: string): string {
  return SESSION_ABBR[name] ?? name;
}
```

FastF1 session type names like `"Sprint Race"`, `"Pre-Season Testing"`, or future format variants not in `SESSION_ABBR` will display full names in pill buttons (potentially overflowing). The session key constructed on line 113:
```typescript
const key = `${year}_${event.round}_${abbr(type)}`;
```
produces keys like `"2024_1_Sprint Race"` with a space — invalid session key format, will fail `session_key.split("_")` with 4 parts instead of 3.

**Fix:** Add unknown session types to `SESSION_ABBR`, or sanitize `abbr()` to strip spaces.

---

### L5 — Telemetry store not reset on WS reconnect (only on explicit `close()`)

**File:** `frontend/lib/feeder-client.ts:83–88`

`close()` calls `useLiveTelemetryStore.getState().reset()`, but `open()` (called on reconnect) does not. After a transient disconnect and reconnect, the store retains stale telemetry from before the disconnect until the first new broadcast arrives. Cosmetically: old traces linger briefly on reconnect.

---

## Cross-file Consistency Check

| Python field | TypeScript field | Match? |
|---|---|---|
| `CarState.x: float \| None` | `CarState.x: number \| null` | ✅ |
| `CarState.y: float \| None` | `CarState.y: number \| null` | ✅ |
| `CarState.car_class: str \| None` | `car_class: string \| null` | ✅ |
| `CarState.fuel_state: dict \| None` | `fuel_state: Record<string, number> \| null` | ✅ |
| `CalendarEvent.round` etc. | `CalendarEvent.round` etc. (7 fields) | ✅ |
| `WsMessage.type: "telemetry"` | `{ type: "telemetry"; data: Record<...> }` | ✅ |

All model fields match across the boundary.

---

## Positive Observations

- `_decompress_z()` handles pre-decoded dict (already parsed by livef1) cleanly with `isinstance(raw, dict)` guard.
- `_apply_position_z` + `_apply_cardata_z` wrapped in per-call try/except — malformed frames degrade gracefully.
- `fetchPoints()` dedup via `fetchPromise` map correctly prevents concurrent identical fetches.
- Module-level `pointsCache` and `geoCache` avoid redundant re-computation on tab switches.
- `get_circuit_outline()` path sanitization replaces both space and `/` — prevents the most likely filesystem escapes.
- `_was_in_pit` transition logic (False→True edge) is correct for counting pit entries.
- `QUEUE_MAX=60` with drop-oldest protects against slow-client queue growth.
- Fallback chain in `get_calendar()` (FastF1 fail → DuckDB local-only) is well-structured.

---

## Recommended Actions (Prioritized)

1. 🔴 **Fix B1**: Remove `rec.get("RacingNumber")` from lap fallback in `_apply_race_control()`.
2. 🔴 **Fix B2**: Add `session_key` format validation regex in `telemetry_service.py` (both `get_track_outline` and `get_lap_telemetry`).
3. 🟡 **Fix W2**: Guard `buildGeo()` against zero-range scale (add `if range < 0.001 return null`).
4. 🟡 **Fix W1**: Release `_CACHE_LOCK` around the executor call to avoid serializing different-year requests.
5. 🟡 **Fix W3**: Truncate telemetry broadcast to last N incremental samples (or use per-driver selector in frontend).
6. 🟠 **Fix M1**: Call `_extract_outline_from_session()` from `get_track_outline()` to remove duplication.
7. 🟠 **Fix M2**: Add try/catch around `JSON.parse` in `feeder-client.ts:33`.
8. 🟠 **Fix M3**: Either implement live laps polling or remove the dead interval in `TelemetryView`.
9. 🟢 **Fix L4**: Add space-sanitization in `abbr()` or expand `SESSION_ABBR` to cover Sprint Race and testing session names to prevent malformed session keys.
10. 🟢 **Fix L2**: Pass actual circuit name from `api.liveSession()` to `TrackMap` for live session.

---

## Metrics

- Type Coverage: Python models fully typed; TS interfaces match Python models exactly
- Auth: None (internal tool — acceptable)
- Linting: Not run (environment limitation)
- Test Coverage: Not assessed — no test files in changed set

---

## Unresolved Questions

1. Does the `livef1` library actually deliver `"InPit"` as a boolean, integer, or string? The field is on `TimingData` — behavior depends on library version.
2. Is `CarData.z` channel key `"45"` the correct F1 channel number for brake? F1 uses channel numbering like `0=Speed, 2=Throttle, 3=Gear, 4=RPM, 5=DRS` — brake channel `45` should be verified against the F1 timing spec.
3. What is the expected circuit name format passed to `TrackMap` for live sessions? Currently derived from `sessionKey.split("_")[0]` which gives `"Live"` for `sessionKey="live"` — never resolves.
4. `api.liveSession()` returns a `circuit` field — is it already in scope of `SessionDashboard` when the source is live? If so, L2 fix is straightforward.
