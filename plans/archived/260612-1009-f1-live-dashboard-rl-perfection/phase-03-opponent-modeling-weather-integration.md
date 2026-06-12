---
phase: 3
title: "Opponent Modeling & Weather Integration"
status: pending
priority: P1
effort: "3-4h"
dependencies: [1]
---

# Phase 3: Opponent Modeling & Weather Integration

## Overview

Two parallel improvements to RL model accuracy:
1. **Opponent modeling** — replace the random one/two-stop rivals in `RaceStrategyEnv` with
   behavior-model-sampled strategies, so PPO trains against realistic field behavior
2. **Weather integration** — join the weather table into SC hazard training so the wetness
   feature (currently hardcoded `0.0`) becomes real

Both require the phase 1 archive backfill to have sufficient data.

## Requirements

**Functional: Opponent Modeling**
- `RaceStrategyEnv` rivals draw pit schedules from `BehaviorModel` when `quality=ok`
- Fallback: if behavior model is `quality=fallback`, rivals use existing random 1/2-stop
- Behavior model retrained after backfill: `f1-train-models` → `behavior_meta.json` with `quality=ok`
- Opponent strategy sampling is seeded for reproducibility

**Functional: Weather Integration**
- Weather table has `rainfall` column in archive (already in `ingestion/extractors/session_extras.py`)
- Join weather to laps in `sc_hazard._deployment_table()` — add `wet` feature per lap
- SC hazard fitted with `[intercept, lap1, race_frac, wet]` coefs (stub already exists in code)
- `predict()` in `prediction_service.py` passes real wetness from `RaceState.weather` field

**Non-functional:**
- `RaceStrategyEnv` behavior-model path is optional (env var `F1_OPPONENT_MODEL=1`)
- Weather join is backward-compatible: if weather table empty, `wet=0.0` fallback

## Architecture

```
RaceStrategyEnv.reset() — opponent strategy sampling
  if BehaviorModel().usable:
    for each rival: sample pit laps + compounds from behavior model
    wrap as FixedStrategy(pit_schedule)
  else:
    existing: rng.random() < 0.5 → one_stop else two_stop

sc_hazard._deployment_table(season)
  CURRENT: no weather join, wet column = zeros
  NEW:
    JOIN weather w ON w.session_key = l.session_key
      AND w.session_time_ms BETWEEN l.lap_start_ms AND l.lap_end_ms
    wet = max(w.rainfall) > 0 per lap row

prediction_service.predict()
  CURRENT: wet = False  # hardcoded
  NEW:
    wet = bool(state.weather and state.weather.get("rainfall", 0) > 0)
    pass wet to sc_model.prob_next_lap(...)
```

## Related Code Files

- Modify: `backend/src/f1_strategy/sim/gym_env.py` — opponent sampling from behavior model
- Modify: `backend/src/f1_strategy/strategy/sc_hazard.py` — weather join in `_deployment_table`
- Modify: `backend/src/f1_strategy/strategy/prediction_service.py` — real wetness from `RaceState`
- Modify: `backend/src/f1_strategy/models/race_state.py` — confirm weather field exists or add it
- Read: `backend/src/f1_strategy/strategy/behavior_model.py` — `BehaviorModel` inference API
- Read: `backend/src/f1_strategy/strategy/strategy_sampler.py` — `sample_draw` for MC engine
- Read: `backend/src/f1_strategy/archive/queries.py` — weather query pattern

## Implementation Steps

### Opponent Modeling

1. **Read `BehaviorModel` API** — understand `pit_probs(features)` and `compound_probs(features)`
   return shapes; `usable` flag; feature columns `PIT_FEATURES`
2. **Add `BehaviorModelSampler`** to `strategy_sampler.py` or a new
   `backend/src/f1_strategy/strategy/opponent_sampler.py`:
   ```python
   def sample_rival_strategy(car_id: str, season: int, circuit: str,
                              params: SimParams, rng: np.random.Generator) -> FixedStrategy:
       # build feature rows for each lap 1..total_laps
       # call behavior.pit_probs() → P(pit on each lap)
       # sample one pit lap via rng.choice weighted by probs
       # call behavior.compound_probs() at sampled lap → sample compound
       # return FixedStrategy({pit_lap: compound})
   ```
3. **Modify `RaceStrategyEnv.reset()`** — check `BehaviorModel().usable`; if true, call
   `sample_rival_strategy` for each rival; else keep existing random logic
4. **Guard with env var** — `F1_OPPONENT_MODEL=1` enables behavior-model rivals; off by default
   until phase 2 retraining is complete (avoids changing training dynamics mid-run)
5. **Retrain behavior model** — `uv run f1-train-models`; verify `behavior_meta.json`
   shows `quality=ok` and `auc_model > auc_baseline` on holdout

### Weather Integration

6. **Inspect weather table schema** — `SELECT * FROM weather LIMIT 5` in DuckDB; confirm
   `rainfall` column name and session_time_ms alignment with laps table
7. **Update `_deployment_table()`** in `sc_hazard.py`:
   ```python
   # Add JOIN weather w USING (session_key)
   # GROUP BY adds: max(CASE WHEN w.rainfall > 0 THEN 1 ELSE 0 END) wet
   # Pass wet column to LogisticRegression X matrix (removes the np.zeros stub)
   ```
8. **Retrain SC hazard** — `uv run f1-train-models --sc`; verify `sc_hazard_{season}.json`
   shows `mode=fitted` (needs ≥10 SC deployments) and coefs has 4 elements
9. **Update `prediction_service.predict()`** — extract wetness from `state.weather` dict
   (`state.weather` is currently `None`; add weather field to `RaceState` tick if missing)
10. **Update `RaceState` model** — add `weather: dict | None = None` field if not present;
    wire `timeline_builder.py` to include weather snapshot per tick

## Success Criteria

- [ ] `RaceStrategyEnv` rivals sample from behavior model when `F1_OPPONENT_MODEL=1`
- [ ] Without flag: existing random 1/2-stop behavior unchanged (no regression)
- [ ] `behavior_meta.json` shows `quality=ok` after backfill + retraining
- [ ] `sc_hazard_{season}.json` shows `mode=fitted` with 4-coef vector after retraining
- [ ] `prediction_service.predict()` passes real `wet` bool (not hardcoded False)
- [ ] Weather join does not break SC hazard fit when weather table is empty (fallback to `wet=0`)
- [ ] PPO retrained with `F1_OPPONENT_MODEL=1` maintains or improves gate metrics

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Behavior model still `quality=fallback` after backfill (too few races) | fallback path already in place; flag kept until quality gate passes |
| Weather rainfall column name differs from expectation | Inspect with DuckDB shell before coding JOIN |
| SC hazard still prior mode (too few deployments per circuit) | Season-level model already; check n_deployments in output |
| Opponent modeling changes training dynamics — PPO gate metrics regress | A/B: train one circuit with and without; gate must still pass |
