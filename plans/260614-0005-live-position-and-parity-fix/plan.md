---
title: "Live Position Tracking and Archive Parity Fix"
status: complete
priority: P0
created: "2026-06-14"
tags: [live, track-map, signalr, parity, rl]
---

# Live Position Tracking and Archive Parity Fix

## Context

Live sessions use SignalR Core through `LiveF1Feeder`; archive sessions use
`ArchiveFeeder` and `RaceTimeline`. Both stream `RaceState` through
`/ws/feed/{session_key}`. The live track map currently prefers raw `x/y` from
`Position.z`, but can project those coordinates against a FastF1 fallback
outline. Live cars also emit `lap_fraction=0`, so fallback map placement stacks
cars at start/finish.

## Requirements

- Fix live driver-on-track placement using real `Position.z` on multiviewer
  geometry when available.
- Add f1-dash-style live sector progress fallback from `TimingData.Sectors`.
- Keep archive map behavior unchanged.
- Wire live race-control messages and live team radio into existing UI surfaces.
- Verify live and archive share strategy/RL prediction broadcast path; document
  remaining live-only validation limit.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Live Track Position Fix](./phase-01-live-track-position-fix.md) | Complete |
| 2 | [Live Archive Parity Wiring](./phase-02-live-archive-parity-wiring.md) | Complete |
| 3 | [Validation and Report](./phase-03-validation-and-report.md) | Complete |

## Acceptance Criteria

- Live map uses raw live coordinates only with multiviewer geometry.
- Live map falls back to non-zero sector-derived `lap_fraction` when raw
  positions are missing or raw projection is unsafe.
- Archive map and replay controls remain unchanged.
- Live race-control strip receives `RaceState.rc_messages`.
- Live team-radio timeline reads `RaceState.team_radio_captures`.
- Backend and frontend verification commands pass, or live-broadcast limits are
  documented.

## Key Touchpoints

- `backend/src/f1_strategy/feeder/livef1_feeder.py`
- `frontend/lib/use-track-geo.ts`
- `frontend/components/track-map.tsx`
- `frontend/lib/race-state-store.ts`
- `frontend/components/widgets/team-radio-timeline.tsx`
- `frontend/lib/types.ts`

## Open Questions

- Real live-race end-to-end confirmation still needs an active F1 broadcast.
