<div align="center">

# F1 Pit Wall

### Real-Time Formula 1 Strategy Dashboard with RL/ML Layer

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Stable-Baselines3](https://img.shields.io/badge/SB3-PPO%2FRS--RL-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)](https://stable-baselines3.readthedocs.io)

**Live F1 timing dashboard + archive race viewer with an RL/ML strategy layer — recommended pit windows, safety-car hazard, and what-if exploration.**

[Quick Start](#-quick-start) · [Live Feed](#-live-feed) · [Archive](#-archive--data) · [Models](#-rl--ml-models) · [Dev Commands](#-dev-commands) · [API](#-api-docs)

</div>

---

## Highlights

- **Live Timing** — native SignalR Core WebSocket (`livetiming.formula1.com/signalrcore`, no auth) with 17 data topics: positions, car telemetry, mini-sectors, DRS state, ExtrapolatedClock, championship prediction
- **Track Map** — real GPS car positions (live) or arc-fraction interpolation (archive); live circuit outlines from the multiviewer.app API; DRS zone overlays; SC/VSC status pulse
- **Archive Viewer** — load any F1 session 2024→now on demand via FastF1; replay at variable speed with full timing tower, telemetry overlay, pace ranking, and stint analysis
- **RL Strategy Layer** — PPO agents trained per circuit on 2024 archive data; live per-driver action chips (PIT / PIT_SOFT / STAY); what-if pit simulator; SC hazard probability
- **RS-RL Challenger** — recurrent strategy agent (GRU policy) trained on 2025 Barcelona for head-to-head comparison against the PPO baseline
- **Qualifying UI** — Q1/Q2/Q3 session part badge, mini-sector colour strips (purple/green/yellow), elimination-zone danger rows, KnockedOut dimming, Cutoff amber pulse
- **Team Radio Timeline** — per-driver radio captures surfaced in the race view

---

## Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.12, FastAPI + WebSocket, uv, FastF1, DuckDB + Parquet |
| **RL/ML** | Stable-Baselines3 (PPO), PyTorch (RS-RL GRU), LightGBM (SC hazard), scikit-learn |
| **Frontend** | Next.js 16, TypeScript, Tailwind CSS, Zustand, canvas API |
| **Live Data** | SignalR Core WebSocket (F1 official), multiviewer.app circuit API, OpenF1 API |

---

## Quick Start

```bash
# Backend — requires uv (https://docs.astral.sh/uv/)
cd backend && uv sync
uv run uvicorn f1_strategy.api.app:app --reload --port 8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:8000` |
| API Docs | `http://localhost:8000/docs` |

Or use the convenience scripts:

```bash
./start.sh   # background both servers (logs → ./logs/)
./stop.sh    # stop both
make status  # check running PIDs
```

---

## Project Layout

```
.
├── backend/
│   ├── src/f1_strategy/
│   │   ├── api/              # FastAPI routes + WebSocket handlers
│   │   ├── archive/          # DuckDB/Parquet queries, FastF1 ingest
│   │   ├── feeder/           # Live SignalR Core client + session registry
│   │   ├── models/           # Pydantic schemas (RaceState, SessionMeta, …)
│   │   ├── replay/           # Archive replay engine
│   │   ├── sim/              # Gymnasium env + observation features
│   │   └── strategy/         # PPO, RS-RL, SC hazard, prediction service
│   ├── scripts/              # Standalone analysis & tournament scripts
│   └── tests/
├── frontend/
│   ├── app/                  # Next.js App Router pages
│   ├── components/           # React components (timing, track map, telemetry, …)
│   └── lib/                  # Stores (Zustand), API clients, types
├── data/                     # gitignored (archive, cache) except models/
│   └── models/               # Trained artifacts — committed (~4 MB)
├── docs/                     # Journals, architecture notes
├── plans/                    # Implementation plans
├── Makefile
├── start.sh / stop.sh
└── .gitignore
```

---

## Live Feed

The backend connects to the official F1 SignalR Core endpoint — **no F1TV subscription or API key required**.

```
livetiming.formula1.com/signalrcore
```

**Protocol:**
1. HTTP negotiate → `connectionToken` + `AWSALBCORS` cookie
2. WebSocket with `BestHTTP` user-agent; record separator `\x1E` terminates frames
3. Delta-merge: dict+dict = recursive patch; list+dict(int keys) = patch-by-index

**Subscribed topics (17):** `Heartbeat`, `CarData.z`, `Position.z`, `ExtrapolatedClock`, `TimingStats`, `TimingAppData`, `WeatherData`, `TrackStatus`, `SessionStatus`, `DriverList`, `RaceControlMessages`, `SessionInfo`, `SessionData`, `LapCount`, `TimingData`, `TeamRadio`, `ChampionshipPrediction`

Live session auto-detected via OpenF1 API; frontend WS reconnects on session name change.

---

## Archive & Data

The archive is built from FastF1 and stored as Parquet + DuckDB. It is **not committed** — build it locally:

```bash
# Ingest one race weekend
make ingest ARGS="--year 2024 --round 1"

# Backfill 2024 → now (takes ~20–60 min depending on network)
make ingest-backfill

# Drop viewer-fetched scratch sessions (keep only deliberately archived data)
make clean-scratch
```

**Tiers:**
| Tier | Path | Populated by |
|------|------|-------------|
| Archive | `data/parquet/` | `make ingest` / backfill |
| Scratch | `data/scratch_parquet/` | On-demand viewer load (purgeable) |
| FastF1 cache | `data/fastf1_cache/` | FastF1 HTTP cache (purgeable) |

Sessions opened through the viewer auto-fetch into scratch; archive data takes precedence. Purge scratch before model training so models train on deliberately curated data only.

---

## RL / ML Models

Models live in `data/models/` and are committed to the repo (~4 MB total).

| Artifact | Size | Purpose |
|----------|------|---------|
| `ppo_2024_{Circuit}.zip` | ~152 KB each | PPO strategy agents, one per 2024 circuit |
| `ppo_2024_{Circuit}_eval.json` | ~1 KB each | Evaluation metrics for each PPO agent |
| `rsrl_2025_Barcelona.pt` | ~300 KB | RS-RL (GRU) challenger agent, 2025 Barcelona |
| `sc_hazard_2024.json` | ~5 KB | Safety-car hazard probability model |
| `behavior_compound.txt` | ~508 KB | LightGBM compound-choice behavior model |
| `behavior_pit.txt` | ~344 KB | LightGBM pit-timing behavior model |
| `behavior_meta.json` | <1 KB | Feature names and metadata |

**Retrain models** (requires a populated archive):

```bash
make calibrate-all                                         # fit SimParams for all circuits
make train-models                                          # SC hazard + LightGBM behavior
make train-ppo ARGS="--season 2024 --circuit Sakhir"      # PPO for one circuit
# RS-RL challenger (see backend/scripts/run_model_tournament.py for tournament eval)
```

---

## Dev Commands

```bash
make dev                      # backend :8000 + frontend :3000 (foreground, hot-reload)
make test                     # backend pytest
make lint                     # ruff check
make ingest ARGS="--year 2024 --round 1"
make ingest-backfill
make clean-scratch
make calibrate-all
make calibrate-all ARGS="--season 2025"
make train-models
make train-ppo ARGS="--season 2024 --circuit Sakhir --device cuda"
```

---

## Configuration

Environment variables (create `backend/.env` for local dev):

| Variable | Default | Purpose |
|----------|---------|---------|
| `F1_DATA_DIR` | `./data` | Root data directory (archive, models, cache) |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins |

The backend is intentionally zero-config for local dev — no API keys, database setup, or Docker required.

---

## API Docs

With backend running at `:8000`:

| Interface | URL |
|-----------|-----|
| Swagger UI | `http://localhost:8000/docs` |
| ReDoc | `http://localhost:8000/redoc` |
| Health | `GET http://localhost:8000/health` |

Key WebSocket endpoints:
- `ws://localhost:8000/ws/feed/live` — live session feed
- `ws://localhost:8000/ws/replay/{session_key}` — archive replay (e.g. `2024_1_R`)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Address already in use` on `:8000` | `fuser -k 8000/tcp` |
| Session shows "Waiting for data…" | Session not in archive — viewer will auto-fetch into scratch; wait ~10–30 s |
| Track map shows skeleton | Circuit outline loading from FastF1/multiviewer; wait a few seconds |
| Live feed not connecting | No F1 session is currently broadcasting — connect only during race weekends |
| PPO chip shows wrong recommendation | Models trained on 2024; degraded accuracy for 2025+ circuits |
| `uv sync` fails | Ensure Python 3.12 is available: `uv python install 3.12` |
