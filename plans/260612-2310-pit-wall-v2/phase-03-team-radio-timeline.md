---
phase: 3
title: "Team Radio Timeline"
status: pending
priority: P1
effort: "2d"
dependencies: []
---

# Phase 03: Team Radio Timeline

## Overview

A scrollable timeline of team radio messages in the strategy sidebar. Each entry shows
lap/time, driver code, message text (if available from FastF1), and an audio play button
for archived sessions. Adds narrative feel — critical for race strategy context.

## Requirements

### Functional
- Display team radio messages chronologically, newest on top
- Each entry: lap number, driver code (team-colored), message text or "[audio only]"
- Audio play button for sessions where FastF1 provides audio URLs
- Live sessions: append messages as they arrive via WebSocket (`race_control` topic)
- Archived sessions: load all messages on mount via REST endpoint

### Non-functional
- Max 200 messages in DOM; virtualise or slice if needed
- No new npm packages for audio — use native `<audio>` element
- Message text may be null (FastF1 only provides text for some sessions)

## Architecture

### Backend
```
GET /api/sessions/{key}/team-radio
→ [{ lap: int, t_session_s: float, driver_code: str, msg: str|null, audio_url: str|null }]
```
Source: `session.car_data` + `session.race_control_messages` from FastF1.
For live: extend `ws_feeder.py` to emit `{ type: "team_radio", data: [...] }` messages.

### Frontend
- `components/widgets/team-radio-timeline.tsx` — renders message list
- `lib/api-client.ts` — add `api.teamRadio(key)`
- Strategy panel: add "Radio" collapsible section below what-if panel

## Related Code Files

- Create: `backend/src/f1_strategy/api/routes_team_radio.py`
- Modify: `backend/src/f1_strategy/api/app.py` (register router)
- Modify: `frontend/lib/api-client.ts`
- Modify: `frontend/lib/types.ts` (add `TeamRadioMessage`)
- Create: `frontend/components/widgets/team-radio-timeline.tsx`
- Modify: `frontend/components/strategy/strategy-panel.tsx`

## Implementation Steps

1. Create `routes_team_radio.py` — FastF1 fetch + serialize team radio
2. Wire router into `app.py`
3. Add `TeamRadioMessage` type + `api.teamRadio()` to frontend
4. Build `team-radio-timeline.tsx` — scrollable list, audio button per row
5. Add to strategy panel as collapsible section
6. Test: load a 2024 race; verify messages appear with correct driver colors

## Success Criteria

- [ ] Team radio endpoint returns 200 and >0 messages for a 2024 race
- [ ] Timeline renders in strategy sidebar, newest message first
- [ ] Audio play button present; clicking it plays audio (or shows "no audio" if unavailable)
- [ ] Live session appends new messages without full reload

## Risk Assessment

- FastF1 `team_radio` data requires internet at fetch time — wrap in try/except, return empty list
- Audio URLs from FastF1 may expire; display "expired" state gracefully
