---
title: "F1 Live Dashboard + RL Model Perfection"
description: >-
  Full archive backfill, per-circuit RL training, live tracking via OpenF1,
  complete dashboard redesign with 60fps canvas, and production-grade strategy overlay.
status: pending
priority: P1
branch: "main"
tags:
  - f1
  - rl
  - live
  - dashboard
  - design
blockedBy: []
blocks: []
created: "2026-06-12T03:10:32.251Z"
createdBy: "ck:plan"
source: skill
---

# F1 Live Dashboard + RL Model Perfection

## Overview

Transforms the single-race RL proof-of-concept into a fully accurate per-circuit strategy
system backed by the complete 2024-25 archive, and delivers a production-quality live-tracking
dashboard with a professional "pit wall" design. Two parallel tracks:

**RL Track (phases 1-3):** Full backfill → per-circuit calibration → PPO checkpoints per circuit
→ opponent modeling → weather integration. Quality bar: every circuit must pass the ≥1.5s/≥55%
gate, SC hazard fitted, behavior model quality=ok.

**Dashboard Track (phases 4-10):** IFeeder abstraction → OpenF1 live source → design system →
60fps Canvas2D multi-driver dashboard → strategy overlay → what-if explorer v2 → production.

## Architecture

```
backend/
  ingestion/       existing + batch-calibration CLI (phase 1)
  sim/calibration/ per-circuit SimParams fit (phase 1)
  strategy/
    ppo_agent/     per-circuit checkpoints + cluster training (phase 2)
    behavior_model/opponent modeling hooks (phase 3)
    sc_hazard/     weather-joined fit (phase 3)
  feeder/          NEW: IFeeder + ArchiveFeeder + LiveFeeder (phase 4-5)
  api/
    ws_feeder.py   NEW: WS backed by IFeeder (phase 4)
    routes_live.py NEW: source-switch REST (phase 5)

frontend/
  lib/
    design-tokens.ts  NEW: F1 palette, typography, spacing (phase 6)
    feeder-client.ts  NEW: source-agnostic WS client (phase 4)
  components/
    layout/           NEW: AppShell, RaceHeader, SideNav (phase 6)
    track-map/        REDESIGN: Canvas2D 60fps + sectors + DRS (phase 7)
    timing-tower/     REDESIGN: team colors, fastest-lap highlights (phase 7)
    gap-chart/        REDESIGN: d3 scrub bar (phase 7)
    telemetry/        REDESIGN: multi-driver overlay (phase 7)
    strategy-overlay/ REDESIGN: PPO cards, MC bars, SC gauge (phase 8)
    what-if/          REDESIGN: compound selector, scenario compare (phase 9)
```

## Phases

| Phase | Name | Status | Effort | Deps |
|-------|------|--------|--------|------|
| 1 | [RL Backfill & Per-Circuit Calibration](./phase-01-rl-backfill-per-circuit-calibration.md) | Pending | 2-4h | — |
| 2 | [Per-Circuit PPO Training Pipeline](./phase-02-per-circuit-ppo-training-pipeline.md) | Pending | 3-5h | 1 |
| 3 | [Opponent Modeling & Weather Integration](./phase-03-opponent-modeling-weather-integration.md) | Pending | 3-4h | 1 |
| 4 | [IFeeder Abstraction & ArchiveFeeder](./phase-04-ifeeder-abstraction-archivefeeder.md) | Pending | 2-3h | — |
| 5 | [OpenF1 LiveFeeder Integration](./phase-05-openf1-livefeeder-integration.md) | Pending | 3-5h | 4 |
| 6 | [Design System & Shell Redesign](./phase-06-design-system-shell-redesign.md) | Pending | 2-3h | — |
| 7 | [Multi-Driver Canvas Dashboard](./phase-07-multi-driver-canvas-dashboard.md) | Pending | 5-7h | 4, 6 |
| 8 | [Strategy Overlay Redesign](./phase-08-strategy-overlay-redesign.md) | Pending | 3-4h | 6, 7 |
| 9 | [What-If Explorer v2](./phase-09-what-if-explorer-v2.md) | Pending | 2-3h | 8 |
| 10 | [Production Readiness](./phase-10-production-readiness.md) | Pending | 2-3h | 2, 3, 5, 9 |

**Dependency chain:**
- RL path: 1 → 2 → 10 and 1 → 3 → 10
- Dashboard path: 4 → 5 → 10 and 6 → 7 → 8 → 9 → 10
- Phases 1, 4, and 6 can all start in parallel (no inter-dependencies)

## Dependencies

Previous plan: `plans/260610-2226-f1-viewer-rl-strategy-system/` (completed, status=completed).
This plan extends it — no blockedBy relationship (predecessor is done).

## Out of Scope
- WEC/multi-series support
- Authentication / cloud hosting
- Physics-level deterministic simulation
- Sub-second telemetry streaming (OpenF1 REST polls at ~1-2s)
