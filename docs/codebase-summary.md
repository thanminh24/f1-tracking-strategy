# Codebase Summary

_Generated from the repository snapshot on 2026-06-14._

## Overview

`F1 Pit Wall` is a real-time Formula 1 strategy dashboard with two primary
session modes:

- **Live** sessions stream official SignalR Core timing data from
  `livetiming.formula1.com/signalrcore`.
- **Archive** sessions replay curated FastF1 data from the local archive layer.

The application combines a FastAPI backend, a Next.js frontend, and the shared
state model in `backend/src/f1_strategy/models/race_state.py` so the same UI
can render both live broadcasts and replayed sessions.

## Repository Layout

| Path | Purpose |
|------|---------|
| `backend/` | FastAPI service, feeders, archive pipeline, simulation, and strategy code |
| `frontend/` | Next.js App Router UI, dashboard widgets, stores, and canvas helpers |
| `data/` | Local archive, cache, and committed model artifacts |
| `docs/` | Project documentation and journal entries |
| `plans/` | Implementation plans and delivery reports |

## Backend Architecture

The backend lives under `backend/src/f1_strategy/` and is organized by
responsibility:

| Module | Responsibility |
|--------|----------------|
| `api/` | HTTP routes, WebSocket endpoints, and feed wiring |
| `feeder/` | Live and archive feeders plus session registry logic |
| `archive/` | FastF1 ingest, DuckDB/Parquet storage, and archive queries |
| `replay/` | Timeline construction and replay-session helpers |
| `sim/` | Gymnasium environments and race simulation utilities |
| `strategy/` | Prediction service, hazard models, and recommendation logic |
| `models/` | Pydantic state models shared across backend and frontend contracts |

### Main Runtime Flow

1. `backend/src/f1_strategy/api/app.py` creates the FastAPI application.
2. `backend/src/f1_strategy/api/ws_feeder.py` and the session registry in
   `backend/src/f1_strategy/feeder/session_registry.py` attach a
   session-specific feeder pump.
3. `archive_feeder.py` serves replay data; `livef1_feeder.py` consumes live
   SignalR topics.
4. `prediction_service.py` produces per-session recommendations and hazard
   outputs.
5. The shared state model is broadcast to the frontend over WebSocket.

### Live Data Path

Live sessions now carry the following verified behaviors:

- `livef1_feeder.py` derives `lap_fraction` from `TimingData.Sectors` when raw
  GPS is missing or unsafe.
- `Position.z` is stored for live map projection, but live coordinates are only
  projected when the geometry supports raw live positioning.
- The shared race-state model exposes `rc_messages` from live race-control
  topics.
- The shared race-state model exposes `team_radio_captures` for the live radio
  timeline.
- The session registry keeps live prediction broadcasting on the same path as
  archive sessions.

## Frontend Architecture

The frontend lives under `frontend/` and uses Next.js App Router with a
component/store split:

| Area | Files |
|------|-------|
| App shell | `frontend/app/layout.tsx`, `frontend/app/page.tsx` |
| Dashboard widgets | `frontend/components/*.tsx` |
| Shared state | `frontend/lib/race-state-store.ts`, `frontend/lib/live-telemetry-store.ts` |
| API clients | `frontend/lib/api-client.ts`, `frontend/lib/feeder-client.ts` |
| Track geometry | `frontend/lib/use-track-geo.ts`, `frontend/components/track-map.tsx` |
| Telemetry helpers | `frontend/lib/telemetry-helpers.ts`, `frontend/lib/telemetry-chart-helpers.ts` |

### Key UI Surfaces

- `frontend/components/track-map.tsx` renders either archive arc-fraction
  positions or live multiviewer geometry.
- `frontend/lib/use-track-geo.ts` fetches multiviewer circuit outlines for live
  sessions and falls back to FastF1 geometry when needed.
- `frontend/components/widgets/team-radio-timeline.tsx` renders archive radio
  from API data and live radio from `team_radio_captures`.
- `frontend/lib/race-state-store.ts` merges live race-control messages into the
  dashboard store.

## Data Model

Shared state is centered around
`backend/src/f1_strategy/models/race_state.py` and mirrored in
`frontend/lib/types.ts`.

Important fields include:

- `cars`
- `rc_messages`
- `weather`
- `driver_list`
- `live_timing`
- `live_timing_app`
- `live_timing_stats`
- `extrapolated_clock`
- `championship`
- `team_radio_captures`
- `session_info`

This keeps the live feed and archive replay contract aligned without separate
frontend data shapes.

## Archive Pipeline

Archive sessions are built from FastF1 data and stored locally in a DuckDB /
Parquet-backed archive.

Relevant backend modules:

- `backend/src/f1_strategy/archive/build_db.py`
- `backend/src/f1_strategy/archive/db.py`
- `backend/src/f1_strategy/archive/queries.py`
- `backend/src/f1_strategy/archive/telemetry_service.py`
- `backend/src/f1_strategy/ingestion/pipeline.py`
- `backend/src/f1_strategy/ingestion/parquet_writer.py`

The archive is designed for replay, offline analysis, and model training.

## Strategy And Simulation

The strategy layer provides recommendation and analysis tooling:

- `backend/src/f1_strategy/strategy/prediction_service.py` orchestrates per-lap
  predictions.
- `backend/src/f1_strategy/strategy/sc_hazard.py` estimates safety-car hazard.
- `backend/src/f1_strategy/strategy/mc_engine.py` supports what-if analysis.
- `backend/src/f1_strategy/sim/` contains the race simulation and Gymnasium
  environment helpers.

The frontend consumes these outputs as strategy cards, prediction tables, and
race overlays.

## Testing And Validation

Current validation entry points:

- `cd backend && uv run pytest`
- `cd frontend && npm run build`
- `make test`
- `make lint`

The live-position/parity fix was validated with backend pytest and the frontend
production build.

## Documentation Notes

- `docs/` currently contains journal entries plus this summary.
- Feature-specific implementation notes live in `plans/` and should be treated
  as delivery artifacts, not long-term reference docs.
- The repository README remains the best high-level user-facing entry point for
  setup and runtime behavior.
