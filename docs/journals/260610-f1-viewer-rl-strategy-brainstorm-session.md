# Journal — 2026-06-10 — F1 Viewer + RL Strategy System Brainstorm

## What happened

Greenfield brainstorm session (empty repo). Researched existing F1 viewer/strategy systems, locked scope with user, design APPROVED. Report: `plans/reports/brainstorm-260610-2213-f1-viewer-rl-strategy-system-report.md`. User deferred `/ck:plan` to a later session.

## Key decisions

- **Replay-first live data**: replay archived races as "simulated live" through a `LiveSource` interface; F1 SignalR live adapter deferred to v2. Rationale: testable any day vs ~24 race weekends/yr; OpenF1 realtime now paid.
- **Stack**: FastAPI + WebSocket backend, Next.js/React frontend, Parquet + DuckDB archive, FastF1 ingestion (telemetry on-demand, laps/stints/pits full for 2024→now).
- **Sim**: lap-level Gymnasium env (NOT physics-level), deg curves fitted per compound×track from archive. SB3 PPO agent. Trains on user's RTX 4060 laptop.
- **All ML features in scope**: optimal strategy overlay (RL), team behavior prediction (GBM), SC hazard model, MC outcome probabilities, what-if explorer.
- **Probabilistic predictions only** — user explicitly accepted after pushback on "predict when SC comes out"; no deterministic lap-N calls.
- **Local-first**, no hosting (avoids FOM data-redistribution licensing risk).

## Risks flagged

Sim fidelity gates everything (phase-4 validation vs held-out races before RL); small behavior dataset (~50-60 races); 2026 reg change breaks 2024-25 calibration → per-season params from day one.

## Next step

Run `/ck:plan` with the brainstorm report as context.
