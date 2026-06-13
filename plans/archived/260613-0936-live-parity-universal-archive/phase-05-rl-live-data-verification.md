---
phase: 5
title: "RL Live Data Verification"
status: pending
priority: P2
effort: "2h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: RL Live Data Verification

## Overview

After Phases 1–4 land, verify that the entire RL/ML prediction pipeline runs correctly on live data. The MC engine (`mc_engine.py`) converts `RaceState → sim_inputs` and needs specific `CarState` fields populated. This phase audits each required field, identifies any remaining gaps (especially `total_laps` which is not streamed by SignalR), adds minimal fixes, and confirms the strategy panel renders predictions during a live session.

## Requirements

- **Functional:**
  - `state_to_sim_inputs(state)` succeeds without `None`-coalescing fallbacks masking missing data
  - All MC engine `PIT_FEATURES` fields (`tire_age`, `position`, `stint`, `compound`, `gap_s`) are populated for ≥90% of cars after the first 3 laps
  - `total_laps` available on `RaceState` in live mode (needed for `race_frac` and `laps_left`)
  - Strategy panel renders pit window viz and SC probability gauge during live session
  - `interval_s` and `last_lap_ms` populated (used by timing tower and strategy viz, not MC features)

- **Non-functional:**
  - Verification checklist runnable from `backend/scripts/verify_live_rl.py` (offline: mock state, check no KeyErrors)
  - No changes to MC engine, behavior model, or sim — only feeder + RaceState patching

## Architecture

### RL input coverage audit

| Field | Source | Status after Ph1–4 |
|-------|--------|--------------------|
| `car.tire.compound` | `TimingAppData` / `TimingData` | ✅ LiveF1Feeder |
| `car.tire.age_laps` | `TimingAppData` | ✅ LiveF1Feeder |
| `car.tire.stint` | `TimingAppData` | ✅ LiveF1Feeder |
| `car.position` | `TimingData` | ✅ LiveF1Feeder |
| `car.lap` | `TimingData` | ✅ LiveF1Feeder |
| `car.gap_leader_s` | `TimingData` (GapToLeader) | ✅ LiveF1Feeder |
| `car.interval_s` | `TimingData` (IntervalToPositionAhead) | ✅ LiveF1Feeder |
| `car.last_lap_ms` | `TimingData` (LastLapTime) | ✅ LiveF1Feeder |
| `state.total_laps` | Not in SignalR stream | ❌ **Missing** |
| `car.pit_stops` | `TimingData` (InPit flag) | ⚠️ Approximation |

### `total_laps` resolution strategy

Priority order:
1. **Race control message parse**: `_apply_race_control()` already sees messages like `"5 LAPS REMAINING"` — extract laps remaining + add to current leader lap → derive total.
2. **Schedule metadata**: the `ScheduledSession` for the current round carries session type. For a Race session, we can look up `total_laps` from the most recent archive session of the same circuit (DuckDB: `SELECT total_laps FROM sessions WHERE circuit = ? ORDER BY date_utc DESC LIMIT 1`).
3. **Fallback**: default to 58 laps (median F1 race length); this is already the behavior in `mc_engine.py` via `params.total_laps`.

### `pit_stops` improvement

Currently `InPit=True` fires but count doesn't increment. Fix: track `_was_in_pit: dict[str, bool]`, increment `_pit_stops[dn]` on `False → True` transition (entry into pit lane = lap counted).

## Related Code Files

- Modify: `backend/src/f1_strategy/feeder/livef1_feeder.py`
  - Add `_was_in_pit: dict[str, bool]` state
  - Fix pit stop counter in `_apply_timing()`
  - Add `_total_laps: int | None = None` state
  - Update `_apply_race_control()` to parse "N LAPS REMAINING" → set `_total_laps`
  - Update `_build_state()` to include `total_laps=self._total_laps`
- Modify: `backend/src/f1_strategy/models/race_state.py` — `total_laps: int | None = None` already exists; verify it's passed through
- Create: `backend/scripts/verify_live_rl.py` — offline audit script
- No frontend changes required for this phase

## Implementation Steps

1. **Audit `RaceState.total_laps`** — check current field in `race_state.py`. If already present (`total_laps: int | None = None`), just ensure LiveF1Feeder populates it.

2. **Add `_total_laps` resolution in `_apply_race_control()`**:
   ```python
   import re
   _LAPS_REMAINING_RE = re.compile(r"(\d+)\s+LAPS?\s+REMAINING", re.IGNORECASE)

   def _apply_race_control(self, rec: dict) -> None:
       ...  # existing code
       m = _LAPS_REMAINING_RE.search(msg)
       if m:
           remaining = int(m.group(1))
           leader_lap = max(self._laps.values(), default=0)
           self._total_laps = leader_lap + remaining
   ```

3. **Fix pit stop counter** with `_was_in_pit` transition tracking:
   ```python
   # In __init__:
   self._was_in_pit: dict[str, bool] = {}

   # In _apply_timing():
   in_pit_now = bool(rec.get("InPit") or rec.get("in_pit"))
   was = self._was_in_pit.get(dn, False)
   if in_pit_now and not was:
       self._pit_stops[dn] = self._pit_stops.get(dn, 0) + 1
   self._was_in_pit[dn] = in_pit_now
   ```

4. **Pass `total_laps` in `_build_state()`**:
   ```python
   return RaceState(
       ...
       total_laps=self._total_laps,
   )
   ```

5. **Fallback total_laps from archive** (in `ws_feeder.py` or API layer): if `state.total_laps` is None and session type is Race, query `SELECT total_laps FROM sessions WHERE circuit = ? ORDER BY date_utc DESC LIMIT 1`. Set once and cache on the feeder instance.

6. **Write `verify_live_rl.py`** script:
   ```python
   """Offline audit: build a mock RaceState and verify mc_engine doesn't crash."""
   from f1_strategy.models.race_state import RaceState, CarState, TireState, TrackStatus
   from f1_strategy.strategy.mc_engine import state_to_sim_inputs, run_mc
   from f1_strategy.sim.params import SimParams

   # Build a plausible 20-car state (lap 25 of 58, mixed compounds, mixed gaps)
   # ... construct mock state ...
   cars, cum = state_to_sim_inputs(state)
   assert len(cars) >= 15, "Too few active cars"
   result = run_mc(state, SimParams(), n_draws=2, rollouts_per_draw=3)
   assert result is not None
   print("OK: RL pipeline passed offline audit")
   ```

7. **Manual live verification checklist** (during a live session):
   - Open `/session/live` → wait 3 laps
   - Check timing tower: `interval_s` populated (not all `+∞`)
   - Check strategy panel: pit window bars visible for top 5 drivers
   - Check SC gauge: non-zero probability
   - Check backend logs: no `KeyError`, no `state.total_laps is None` warnings

## Success Criteria

- [ ] `verify_live_rl.py` runs without exception
- [ ] `state.total_laps` populated from RC messages within first 3 laps of a race (or fallback to archive lookup)
- [ ] Pit stop counts increment correctly when a driver exits pit lane
- [ ] Strategy panel pit window viz renders bars for live drivers after 3+ laps
- [ ] No `KeyError` or `AttributeError` in `mc_engine.py` during live session
- [ ] All `CarState` mandatory RL fields non-null for ≥90% of active drivers after warm-up

## Risk Assessment

- **`total_laps` never set if race is watched from lap 1 without any "N LAPS REMAINING" message**: mitigated by archive fallback (most circuits have prior race data). Median fallback (58) handles edge cases.
- **Early-lap gaps/compounds may be None**: `state_to_sim_inputs` already coalesces with `or 0.0` / `or "MEDIUM"` — this is acceptable. Phase verifies the rate of null fields stays below 10%.
- **Behavior model requires archive training data**: model may not be trained. MC engine falls back to heuristic strategies if `BehaviorModel` fails to load — this is the existing fallback and is fine for live mode.
