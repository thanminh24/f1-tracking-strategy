---
phase: 8
title: "Strategy Overlay Redesign"
status: pending
priority: P1
effort: "3-4h"
dependencies: [6, 7]
---

# Phase 8: Strategy Overlay Redesign

## Overview

Redesign the strategy panel into a professional per-driver overlay that makes PPO
recommendations, MC outcome probabilities, and SC hazard visible at a glance. The current
`StrategyPanel` is functional but visually plain. This phase replaces it with styled
components using the design system from phase 6, and adds a persistent undercut alert toast
system with proper timing.

## Requirements

**Functional:**
- **PPO recommendation cards**: one card per running driver, sorted by position;
  shows `recommended_action` (STAY/PIT_SOFT/PIT_MEDIUM/PIT_HARD) + action probability
  bar (4 bars, color-coded by compound); team color header
- **MC outcome bar chart**: per-driver win/podium/points probability as horizontal bars;
  expected position shown as number
- **SC hazard gauge**: ring gauge showing P(SC next lap) and P(SC within 5 laps);
  amber at >15%, red at >30%; label shows current SC mode (prior/fitted)
- **Undercut alert toasts**: trigger when interval to car behind <2.0s AND that car's
  `pit_window_probs` peak lap is within 3 laps; toast auto-dismisses after 8s;
  max 3 concurrent toasts; stack in bottom-right
- **Model version badges**: small badges showing `sc_hazard: prior/fitted`,
  `behavior: fallback/ok`, `ppo: none/ppo_2024_Sakhir`
- **Prediction compute time**: shown as `{n_rollouts} rollouts · {compute_ms}ms`

**Non-functional:**
- Strategy panel updates at same cadence as WS ticks (1Hz)
- PPO cards scroll if >10 drivers visible; track map remains fixed height
- Toasts use CSS transitions (no external toast library)
- Panel collapses to icon-only strip when screen width < 1280px

## Architecture

```
StrategyPanel (redesigned)
  ├── SCHazardGauge           ring SVG, 2 arcs (1-lap, 5-lap)
  ├── ModelStatusBadges       3 small badges (sc/behavior/ppo mode)
  ├── PPODriverCards          scrollable list, 1 card per running driver
  │     PPOCard(car_id)
  │       ├── header: team color + driver code + position
  │       ├── recommended action chip (color by compound)
  │       └── action probability bars (4 × horizontal bar)
  ├── MCOutcomeChart          horizontal bar chart per driver
  │     MCOutcomeRow(car_id)
  │       win | podium | points | E[pos]
  └── UnderCutAlertToasts     position: fixed bottom-right
        Toast(car_id, target_car_id, lap_window)

Data flow:
  WS tick → PredictionSet (ws_feeder sends alongside RaceState)
  useStrategyStore → components read latest PredictionSet
```

**Undercut trigger logic (frontend):**
```
for each car C (sorted by position):
  car_behind = cars[C.position]  // 1 position behind
  if C.interval_s < 2.0 AND car_behind exists:
    peak_pit_lap = argmax(car_behind.pit_window_probs)
    if |peak_pit_lap - current_lap| <= 3:
      trigger undercut alert for C (C risks being undercut by car_behind)
```

**SC hazard ring gauge design:**
```
SVG viewBox 0 0 120 120, center 60 60, r=50
Outer arc: P(SC within 5 laps) — grey bg + colored fill
Inner arc: P(SC next lap) — grey bg + colored fill
Color: green <15%, amber 15-30%, red >30%
Center text: "SC" label + P(next) percentage
```

## Related Code Files

- Modify: `frontend/components/strategy-overlay/strategy-panel.tsx` — full redesign
- Modify: `frontend/components/strategy-overlay/driver-strategy-cards.tsx` — PPO card redesign
- Modify: `frontend/components/strategy-overlay/outcome-probability-table.tsx` → MC bar chart
- Modify: `frontend/components/strategy-overlay/sc-probability-gauge.tsx` — ring gauge
- Modify: `frontend/components/strategy-overlay/undercut-alert-toasts.tsx` — styled toasts
- Create: `frontend/lib/use-strategy-store.ts` — Zustand store for latest PredictionSet
- Modify: `frontend/lib/feeder-client.ts` — parse `prediction` message type alongside `state`
- Modify: `backend/src/f1_strategy/api/ws_feeder.py` — send PredictionSet as separate WS msg

## Implementation Steps

1. **Add prediction messages to WS** — in `ws_feeder.py`, after every state tick, run
   `prediction_service.predict(state)` in thread (existing pattern from `ws_replay.py`);
   send as `{"type": "prediction", "data": prediction.model_dump()}`
2. **Create `lib/use-strategy-store.ts`** — Zustand store with `prediction: PredictionSet | null`;
   `FeederClient` calls `set({prediction})` on `type=prediction` messages
3. **Redesign `sc-probability-gauge.tsx`** — SVG ring gauge per architecture above;
   color thresholds: green/amber/red; show mode badge (`prior` / `fitted`)
4. **Redesign `driver-strategy-cards.tsx`** — PPO cards:
   - Header: team color strip + driver code + position number
   - Action chip: `STAY` zinc, `PIT_SOFT` yellow, `PIT_MEDIUM` white, `PIT_HARD` gray
   - Probability bars: 4 bars side-by-side, width = probability %, labeled with %
5. **Redesign `outcome-probability-table.tsx`** — horizontal bars per driver per outcome:
   - Win bar (red), Podium bar (amber), Points bar (green), E[pos] number right-aligned
6. **Redesign `undercut-alert-toasts.tsx`** — compute undercut conditions in component;
   toasts: `fixed bottom-4 right-4 flex flex-col gap-2`; each toast has driver code,
   "at risk of undercut from {car_behind}", lap window, auto-dismiss timer progress bar
7. **Add `ModelStatusBadges`** inline in `strategy-panel.tsx` header area
8. **Add compute stats** — `{n_rollouts} rollouts · {compute_ms}ms` in muted text footer

## Success Criteria

- [ ] PPO cards show all running drivers sorted by position with team colors
- [ ] Action probability bars sum to ~100% and are labeled with % values
- [ ] SC hazard ring gauge updates every tick; color changes at 15%/30% thresholds
- [ ] SC mode badge shows `prior` or `fitted` from `prediction.meta.model_versions`
- [ ] MC outcome bars visible for all cars with non-zero outcome probabilities
- [ ] Undercut toast fires when interval < 2s AND peak pit window within 3 laps
- [ ] Toasts auto-dismiss after 8s; max 3 concurrent; no duplicate alerts same car
- [ ] Model status badges show correct version strings from `prediction.meta`
- [ ] Panel scrollable when >10 cars; map panel height unaffected

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| PredictionSet null when no calibration (new session) | All components null-safe; show "no predictions" placeholder |
| Prediction compute >1s blocks WS tick delivery | Existing thread-pool pattern; WS sends state first, prediction async |
| Undercut alert spam when interval oscillates around 2s | Debounce: only fire if condition holds for 2 consecutive laps |
| PPO cards overflow panel when all 20 drivers running | Scroll container with `overflow-y-auto max-h-[600px]` |
