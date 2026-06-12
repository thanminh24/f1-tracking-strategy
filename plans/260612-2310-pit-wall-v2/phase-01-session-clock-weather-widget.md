---
phase: 1
title: "Session Clock + Weather Widget"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Phase 01: Session Clock + Weather Widget

## Overview

Two lightweight header widgets that add real-race immersion at low cost:
- **Session clock** — countdown/elapsed timer using `t_session_s` from `RaceState`
- **Weather widget** — air temp, track temp, wind speed, rain flag from FastF1 session meta

## Requirements

### Functional
- Session clock shows elapsed time for live; countdown for scheduled sessions
- Weather data sourced from FastF1 `session.weather_data` DataFrame (already accessible via backend)
- Both widgets visible at all times (header bar or top of strategy panel)
- Weather refreshed once per lap (no need for sub-second polling)

### Non-functional
- No new npm packages — use existing CSS + SVG icons
- Backend: one new endpoint `/api/sessions/{key}/weather` returning latest weather row

## Architecture

### Backend
New endpoint in `routes_archive.py` (or `routes_live.py`):
```python
GET /api/sessions/{key}/weather
→ { air_temp_c, track_temp_c, humidity_pct, wind_speed_ms, wind_dir_deg, rainfall: bool }
```
Data sourced from `session.weather_data.iloc[-1]` via FastF1.

### Frontend
- `components/widgets/session-clock.tsx` — reads `status.t_session_s` from Zustand; formats MM:SS
- `components/widgets/weather-widget.tsx` — fetches `/api/sessions/{key}/weather` on mount + every 60s; shows temp/wind/rain icons
- Both mounted inside `Header` component (right side of top bar)

## Related Code Files

- Modify: `frontend/components/shell/header.tsx`
- Create: `frontend/components/widgets/session-clock.tsx`
- Create: `frontend/components/widgets/weather-widget.tsx`
- Modify: `backend/src/f1_strategy/api/routes_archive.py` (add weather endpoint)
- Modify: `frontend/lib/api-client.ts` (add `api.weather()`)

## Implementation Steps

1. Add `GET /api/sessions/{key}/weather` to backend — fetch from FastF1 weather DataFrame
2. Add `api.weather(key)` to `api-client.ts`
3. Create `session-clock.tsx` — subscribe to `useRaceStateStore` status, format `t_session_s`
4. Create `weather-widget.tsx` — fetch + render temp/wind/rain; auto-refresh 60s
5. Mount both in `header.tsx` right side
6. Test: archive replay shows static weather; live session polls correctly

## Success Criteria

- [ ] Session clock visible and updating in header during replay
- [ ] Weather widget shows air/track temp + rain indicator
- [ ] Weather endpoint returns 200 for an archived session key
- [ ] No layout overflow at 1280px width

## Risk Assessment

- FastF1 `weather_data` may be empty for some session types (FP, qualifying) — fall back gracefully with "—" values
