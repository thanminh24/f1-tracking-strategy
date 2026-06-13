---
phase: 4
title: "Circuit Track Outline Cache"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 4: Circuit Track Outline Cache

## Overview

`GET /api/sessions/{key}/track-outline` calls `get_track_outline(session_key)` which splits the key as `year_round_code` and loads a FastF1 session. For live sessions, `session_key="live"` — the split fails immediately. Add a circuit-level outline cache: `GET /api/circuits/{circuit}/track-outline` backed by FastF1 (resolved by year + circuit name), so TrackMap can render the outline in live mode without a local session file.

This must be implemented before Phase 2 (live position tracking) since TrackMap needs the outline normalization bounds.

## Requirements

- **Functional:**
  - New `GET /api/circuits/{circuit}/track-outline` returns `[{x, y}]` outline points for the circuit
  - `circuit` param is the short name from `ScheduledSession.circuit` (e.g. `"Catalunya"`)
  - Resolved by finding any session with that circuit name in FastF1, then calling `get_track_outline` equivalent on it
  - Outline parquet cached at `data/telemetry_cache/circuit_{circuit}/track_outline.parquet`
  - TrackMap and `useTrackGeo` pass `circuit` instead of `sessionKey` when in live mode
  - Existing `GET /api/sessions/{key}/track-outline` unchanged — still used for archive

- **Non-functional:**
  - FastF1 resolution: search current year schedule → find a round with matching circuit short name → use race session → extract fastest lap outline
  - Cache-on-disk means cold load only once per circuit per server lifetime
  - Returns 404 with helpful message if circuit not found in FastF1

## Architecture

```
GET /api/circuits/{circuit}/track-outline
  → get_circuit_outline(circuit: str)
      → check disk cache: data/telemetry_cache/circuit_{circuit}/track_outline.parquet
      → cache miss: find session (FastF1 current year schedule → match circuit → load race)
      → extract fastest lap position data → downsample → save to parquet
      → return [{x, y}]

useTrackGeo(key: string)
  current: key = session_key → api.trackOutline(key) → /api/sessions/{key}/track-outline
  live:    key = "circuit:Catalunya" → api.circuitOutline(circuit) → /api/circuits/{circuit}/track-outline
```

### Session key convention for live
In live mode, `TrackMap` receives `sessionKey="live"` and `circuit="Catalunya"`. Pass `circuit` as a separate prop to `TrackMap` and a `circuitKey = circuit ? \`circuit:${circuit}\` : sessionKey` to `useTrackGeo`. The hook routes to the correct endpoint based on the `circuit:` prefix.

## Related Code Files

- Modify: `backend/src/f1_strategy/archive/telemetry_service.py` — add `get_circuit_outline(circuit: str) -> pd.DataFrame`
- Modify: `backend/src/f1_strategy/api/routes_archive.py` — add `GET /api/circuits/{circuit}/track-outline`
- Modify: `frontend/lib/api-client.ts` — add `api.circuitOutline(circuit)`
- Modify: `frontend/lib/use-track-geo.ts` — route `circuit:*` keys to `api.circuitOutline()`
- Modify: `frontend/components/track-map.tsx` — pass `circuit` prop; compute `geoKey` from `circuit || sessionKey`

## Implementation Steps

1. **Add `get_circuit_outline(circuit: str) -> pd.DataFrame`** in `telemetry_service.py`:
   ```python
   def get_circuit_outline(circuit: str) -> pd.DataFrame:
       """Track outline by circuit short name — circuit-level cache."""
       safe_name = circuit.replace(" ", "_").replace("/", "_")
       cpath = get_settings().telemetry_cache_dir / f"circuit_{safe_name}" / "track_outline.parquet"
       cpath.parent.mkdir(parents=True, exist_ok=True)
       if cpath.exists():
           return pd.read_parquet(cpath)

       # Find a session in the current year schedule matching this circuit
       import fastf1
       settings = get_settings()
       fastf1.Cache.enable_cache(str(settings.fastf1_cache_dir))
       year = datetime.now().year
       schedule = fastf1.get_event_schedule(year, include_testing=False)
       # FastF1 "Location" column matches our circuit short name
       match = schedule[schedule["Location"].str.lower() == circuit.lower()]
       if match.empty:
           # Try previous year
           year -= 1
           schedule = fastf1.get_event_schedule(year, include_testing=False)
           match = schedule[schedule["Location"].str.lower() == circuit.lower()]
       if match.empty:
           raise ValueError(f"Circuit not found in FastF1 schedule: {circuit!r}")
       
       round_num = int(match.iloc[0]["RoundNumber"])
       session = _load_session(year, round_num, "R")
       fastest = session.laps.pick_fastest()
       pos = fastest.get_pos_data()
       stride = max(1, len(pos) // 800)
       df = pd.DataFrame(
           {"x": pos["X"].astype(float), "y": pos["Y"].astype(float)}
       ).iloc[::stride].reset_index(drop=True)
       df.to_parquet(cpath, index=False)
       return df
   ```

2. **Add route in `routes_archive.py`**:
   ```python
   @router.get("/circuits/{circuit}/track-outline")
   def circuit_track_outline(circuit: str, response: Response) -> list[dict]:
       try:
           from f1_strategy.archive.telemetry_service import get_circuit_outline
           data = get_circuit_outline(circuit).to_dict(orient="records")
           response.headers["Cache-Control"] = "public, max-age=86400"
           return data
       except Exception as exc:
           raise HTTPException(404, f"circuit outline unavailable: {exc}") from exc
   ```

3. **Add `api.circuitOutline(circuit)` in `api-client.ts`**:
   ```typescript
   circuitOutline: (circuit: string) =>
     getJson<OutlinePoint[]>(`/api/circuits/${encodeURIComponent(circuit)}/track-outline`),
   ```

4. **Update `use-track-geo.ts`**: detect `circuit:` prefix in key:
   ```typescript
   function fetchPoints(sessionKey: string): Promise<OutlinePoint[]> {
     const cached = pointsCache.get(sessionKey);
     if (cached) return Promise.resolve(cached);
     const fetchFn = sessionKey.startsWith("circuit:")
       ? api.circuitOutline(sessionKey.slice(8))
       : api.trackOutline(sessionKey);
     let p = fetchPromise.get(sessionKey);
     if (!p) {
       p = fetchFn.then((pts) => { pointsCache.set(sessionKey, pts); ... }).catch(...);
       fetchPromise.set(sessionKey, p);
     }
     return p;
   }
   ```

5. **Update `TrackMap`**:
   - Add `circuit?: string` to `Props`
   - Compute `const geoKey = circuit ? \`circuit:${circuit}\` : sessionKey`
   - Pass `geoKey` to `useTrackGeo()` instead of `sessionKey`

6. **Update wherever TrackMap is rendered in live mode** to pass `circuit` prop (from `ScheduledSession.circuit` or from the live session's metadata).

## Success Criteria

- [ ] `GET /api/circuits/Catalunya/track-outline` returns track outline points
- [ ] Outline cached to disk on first call; second call returns instantly from parquet
- [ ] TrackMap in live session renders circuit outline (not blank canvas)
- [ ] Archive sessions unaffected (still use `sessionKey` path)
- [ ] Unknown circuit returns 404 with clear message

## Risk Assessment

- **FastF1 "Location" vs circuit short name mismatch**: livef1 uses `"Meeting Circuit Shortname"` (e.g. `"Catalunya"`); FastF1 uses `"Location"` (e.g. `"Barcelona"`). Case-insensitive comparison may fail. Mitigation: also check `"EventName"` substring match as fallback; log available names on miss for debugging.
- **FastF1 load time for cold cache**: loading a full session to get pos data takes ~15s. This is a cold-start cost only — parquet cache eliminates all subsequent calls. Run outline fetch lazily (on TrackMap mount, not at server startup).
