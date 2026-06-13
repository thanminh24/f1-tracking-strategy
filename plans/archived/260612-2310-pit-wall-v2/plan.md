---
title: "Pit Wall v2 — Full Redesign + Feature Expansion"
description: >-
  Two tracks: (A) critical fixes + full UI redesign from the ground-up investigation
  (phases 00, 10-14) — real F1 logo, home offline state, Live/Replay toggle, race
  view redesign with RL per-driver overlay, full telemetry view, Race Stats tab, and
  crystal track map; (B) incremental feature expansion from research (phases 01-09) —
  weather, radio, fastest-lap, heatmap, bump chart, keyboard shortcuts.
status: active
priority: P1
branch: main
created: "2026-06-12"
amended: "2026-06-12"
research: "plans/reports/researcher-260612-2310-f1-dashboard-feature-inspiration-report.md"
reference_project: "f1-race-replay-main/ (Python/Arcade desktop — layout inspiration)"
---

# Pit Wall v2 — Full Redesign + Feature Expansion

## Context

Baseline (completed in archived plans):
- Live pipeline: `LiveF1Feeder` bugs fixed, `ws_feeder.py` live/archive branching, CORS env-var driven
- Frontend: full ground-up rewrite — F1 Pit Wall design system, AppShell, timing tower, track map (Canvas2D + driver labels), gap chart, stint bars, playback controls, strategy sidebar (RL model card + SC gauge + pit window + what-if), telemetry compare (multi-driver/multi-lap)
- Docker: single-port nginx gateway (`docker-compose.yml`): nginx:3000 → backend:8000 + frontend:3000

**Root problems discovered in full investigation (2026-06-12):**
1. Homepage renders but is completely non-functional when backend is offline — empty season dropdown, no error state, no fallback entry point
2. F1 logo is a custom SVG rectangle, not the real chevron mark
3. Session page throws unhandled RSC error when backend is offline
4. No Live/Replay mode toggle — source mode is implicit, not user-controlled
5. Race view is a simple 3-column grid with RL buried in a side panel — not integrated into the timing tower
6. Telemetry view requires complex multi-slot setup; doesn't show all laps; no driver-first UX
7. No Race Stats tab (tyre strategy overview, pace comparison, full RL summary, SC history)
8. Track map is thin-outlined, aliased on HiDPI, small driver dots with no team halo

Reference project analyzed: `f1-race-replay-main/` — Python/Arcade desktop app with leaderboard (right panel), weather/legend (left panel), track map (center), driver telemetry on click, tyre degradation, SC overlay, playback speed controls.

Research reference: `plans/reports/researcher-260612-2310-f1-dashboard-feature-inspiration-report.md`

## Phases

### Track A — Critical Fixes + Full Redesign (DO THESE FIRST)

| # | Phase | Status | Priority |
|---|-------|--------|----------|
| 00 | [Bug Fixes](phase-00-bug-fixes.md) — home offline, F1 logo, session crash | complete | P0 |
| 10 | [Live/Replay Mode Switcher + Home Redesign](phase-10-live-replay-mode-switcher.md) | complete | P0 |
| 11 | [Race View Redesign — Pit Wall Layout + RL Per-Driver Overlay](phase-11-race-view-redesign-rl-overlay.md) | complete | P0 |
| 12 | [Full Telemetry View — Driver Picker, All Laps, Live-Adaptive](phase-12-full-telemetry-view.md) | complete | P1 |
| 13 | [Race Stats Tab — Multi-Panel RL Insights Dashboard](phase-13-race-stats-tab-rl-insights.md) | complete | P1 |
| 14 | [Track Map Visual Quality + Real F1 Logo](phase-14-track-map-f1-logo-visual-quality.md) | complete | P1 |

### Track B — Incremental Feature Expansion (after Track A)

| # | Phase | Status | Priority |
|---|-------|--------|----------|
| 01 | [Session Clock + Weather Widget](phase-01-session-clock-weather-widget.md) | complete | P1 |
| 02 | [Fastest Lap + Sector Highlights](phase-02-fastest-lap-sector-highlights.md) | complete | P1 |
| 03 | [Team Radio Timeline](phase-03-team-radio-timeline.md) | complete | P1 |
| 04 | [Driver Head-to-Head Card](phase-04-driver-head-to-head-card.md) | complete | P2 |
| 05 | [Pit-Stop Timer Board](phase-05-pit-stop-timer-board.md) | complete | P2 |
| 06 | [Sector Heatmap](phase-06-sector-heatmap.md) | complete | P2 |
| 07 | [DRS Activation Zones on Track Map](phase-07-drs-zones-track-map.md) | complete | P2 |
| 08 | [Position Bump Chart](phase-08-position-bump-chart.md) | complete | P3 |
| 09 | [Keyboard Shortcuts + UX Polish](phase-09-keyboard-shortcuts-ux-polish.md) | complete | P3 |

## Execution Order

```
Phase 00 (bugs)
  ↓
Phase 10 (home + Live/Replay toggle)  ←── unblocks everything else
  ↓                    ↓
Phase 11              Phase 14
(race view + RL)      (track map + logo)
  ↓
Phase 12              Phase 13
(telemetry)           (stats tab)
  ↓
Phases 01-09 (Track B, incremental)
```

## Key Invariants

- All phases are **additive** — no core architectural refactoring outside Track A
- Keep components under 200 LOC (modularize on breach)
- F1 Pit Wall design tokens (`globals.css`) are the single source of truth for colors/spacing
- Canvas2D for real-time animated overlays; pure SVG for static data charts (no Recharts)
- `teamColor(team)` function (not a lookup map) for all team colors
- `API_BASE = ""` (same-origin via nginx) — never hardcode ports in frontend code
- RL data always optional: all RL-dependent UI must render gracefully when `prediction === null`
