---
title: "SignalR Core Live Feeder + f1-dash Feature Ports"
description: >-
  Replace broken livef1/OpenF1 live pipeline with direct SignalR Core
  websocket (livetiming.formula1.com/signalrcore — no auth, verified working).
  Port high-value f1-dash features: mini-sectors, DRS, TrackStatus map colors,
  multiviewer track maps, ChampionshipPrediction, ExtrapolatedClock, qualifying UI.
status: active
priority: P0
branch: main
tags: [live, signalr, telemetry, track-map, f1-dash]
blockedBy: []
blocks: [260614-0005-live-position-and-parity-fix]
created: "2026-06-13"
research: "plans/reports/researcher-260613-1854-f1-dash-signalr-core-live-data-report.md"
---

# SignalR Core Live Feeder + f1-dash Feature Ports

## Context

**Root discovery (2026-06-13):** `livetiming.formula1.com/signalrcore` (SignalR Core) is a **completely different endpoint** from `/signalr/` (old SignalR). The old endpoint requires F1TV auth during race weekends. The Core endpoint requires only an AWSALBCORS session cookie obtained from a free OPTIONS pre-flight — verified returning HTTP 200 with connectionToken right now.

The `livef1` Python package wraps the old SignalR endpoint and is broken. We replace it with a native `websockets`-based Python client targeting `/signalrcore`.

Track maps: `api.multiviewer.app/api/v1/circuits/{key}/{year}` returns full circuit outline + corners + marshal sectors. Free, no auth. Replaces FastF1 circuit outline entirely.

Research: `plans/reports/researcher-260613-1854-f1-dash-signalr-core-live-data-report.md`

## Phases

| Phase | Name | Status | Priority | Effort |
|-------|------|--------|----------|--------|
| 1 | [SignalR Core Backend Feeder](./phase-01-signalr-core-backend-feeder.md) | Pending | P0 | 3h |
| 2 | [Frontend Live State (CarData+Position)](./phase-02-frontend-live-state-cardata-position.md) | Pending | P0 | 2h |
| 3 | [Multiviewer Track Map API](./phase-03-multiviewer-track-map-api.md) | Pending | P0 | 2h |
| 4 | [f1-dash Ports Ph1: MiniSectors + DRS + TrackStatus](./phase-04-f1-dash-feature-ports-phase-1-minisectors-drs-trackstatus.md) | Pending | P1 | 3h |
| 5 | [f1-dash Ports Ph2: Championship + Clock + Qualifying](./phase-05-f1-dash-feature-ports-phase-2-championship-extrapolatedclock.md) | Pending | P2 | 3h |

## Execution Order

```
Phase 1 (SignalR Core feeder — Python backend)
  ↓
Phase 2 (frontend: all 17 topics incl CarData.z/Position.z)
  ↓         ↓
Phase 3   Phase 4   ← can run in parallel after phase 1+2
(map API)  (mini-sectors, DRS, TrackStatus)
              ↓
           Phase 5 (championship, clock, qualifying UI)
```

## Key Invariants

- **No auth, no F1TV** — only AWSALBCORS cookie (free, obtained from OPTIONS pre-flight)
- `CarData.z` / `Position.z` are zlib raw-inflate + base64; decode with Python `zlib.decompress(data, -zlib.MAX_WBITS)`
- State merge is incremental: subscribe response = full snapshot, feed messages = deltas
- Track map circuitKey comes from `SessionInfo.Meeting.Circuit.Key` in the live stream
- All new live state fields must be optional — dashboard must render gracefully with no live feed
- Keep `LiveF1Feeder` as the class name; replace internals only
