---
phase: 10
title: "Production Readiness"
status: pending
priority: P2
effort: "2-3h"
dependencies: [2, 3, 5, 9]
---

# Phase 10: Production Readiness

## Overview

Final integration pass: end-to-end testing with live + archive sources, RL gate verification
across all circuits, performance validation (60fps canvas, WS latency), and documentation
updates. This phase does not add new features — it verifies everything from phases 1-9 works
together and documents the system for future development.

## Requirements

**Functional:**
- Full end-to-end smoke test: archive session → IFeeder → WS → dashboard renders correctly
- Live source test: OpenF1 historical session → LiveFeeder → dashboard (verifies parse pipeline)
- RL gate report: all circuits with eval JSON; pass rate ≥80%; failing circuits documented
- Source toggle: switching archive ↔ live while dashboard is open works without page reload
- What-if + strategy overlay both render on a completed archive session

**Non-functional:**
- Canvas2D track map: ≤16ms frame time in Chrome performance profiler (60fps)
- WS round-trip: state tick to DOM update ≤50ms on localhost
- Backend cold start: prediction service loads in ≤3s (lazy load already implemented)
- `npm run build` TypeScript compile clean (zero errors, zero `any` warnings on new code)
- `uv run pytest` all tests pass
- `docs/` updated: codebase-summary, system-architecture, project-roadmap

## Architecture

No new modules. This phase is integration + verification + docs.

**Test matrix:**

| Scenario | Source | Models | Expected |
|----------|--------|--------|----------|
| Archive session (Bahrain 2024) | ArchiveFeeder | PPO+SC+behavior fitted | Full strategy overlay |
| Archive session (new circuit) | ArchiveFeeder | Pooled calibration | Overlay with pooled note |
| Archive session (no calibration) | ArchiveFeeder | None | "no predictions" badge |
| OpenF1 historical session | LiveFeeder | N/A | Timing + map; no strategy |
| Source switch mid-session | Archive → Live | N/A | Stream switches; no crash |
| What-if pit now | ArchiveFeeder | Fitted | Delta card rendered |

## Related Code Files

- Modify: `docs/codebase-summary.md` — add feeder module, new components, RL pipeline
- Modify: `docs/system-architecture.md` — add IFeeder diagram, OpenF1 integration
- Modify: `docs/project-roadmap.md` — mark all phases complete, note backfill dependency
- Modify: `README.md` — update Setup + Develop sections (new `make` targets, live toggle)
- Create: `plans/reports/production-readiness-260612-1009-final-gate-verification-report.md`

## Implementation Steps

### RL Gate Verification

1. **Run `f1-train-ppo-all --season 2024`** on backfilled archive; collect eval JSONs
2. **Tabulate gate results** — circuit | gate_passed | mean_gain_s | win_rate;
   flag any circuit failing gate twice (300k + 500k timesteps)
3. **Verify SC hazard mode** — check `sc_hazard_2024.json` shows `mode=fitted`;
   if still prior, document how many SC deployments are in archive and minimum needed
4. **Verify behavior model** — check `behavior_meta.json` shows `quality=ok`;
   log AUC model vs baseline

### Dashboard Integration Tests

5. **Archive end-to-end** — `make dev`, open Bahrain 2024 session, verify:
   - Track map 60fps (Chrome → Performance → record 5s)
   - Timing tower 20 rows, correct team colors
   - Strategy overlay: SC gauge, PPO cards, MC outcome bars all populated
   - What-if: select driver, run scenario, delta card renders
6. **Live source test** — use a past OpenF1 session key (e.g. 2024 Bahrain Race key = 9158);
   switch source to live, verify `LiveFeeder` assembles `RaceState` and dashboard renders
   (timing tower + track map; strategy overlay will be absent — no calibration for live)
7. **Source switch test** — start in archive mode, play to lap 20, switch to live,
   verify no crash and WS stream transitions gracefully
8. **Performance profile** — open Chrome devtools, record 10s of archive replay at 1× speed;
   verify main thread frame budget ≤16ms; identify and fix any jank

### Docs + Cleanup

9. **Update `docs/codebase-summary.md`** — add `feeder/` module, new frontend components,
   new CLIs (`f1-batch-calibrate`, `f1-train-ppo-all`)
10. **Update `docs/system-architecture.md`** — add IFeeder/OpenF1 flow diagram
11. **Update `README.md`** — new `make` targets section:
    ```
    make calibrate-all          # fit SimParams for all archived circuits
    make train-ppo-all          # train + eval PPO for all circuits (GPU)
    make train-models           # SC hazard + behavior model
    ```
12. **Update `docs/project-roadmap.md`** — mark phases 1-10 complete; note
    that full RL gate requires completed backfill (`make ingest-backfill`)
13. **Write final gate report** to `plans/reports/production-readiness-260612-1009-final-gate-verification-report.md`

## Success Criteria

- [ ] Archive session renders full dashboard end-to-end: map + tower + gap + strategy + what-if
- [ ] Track map ≤16ms frame time (Chrome profiler, 10s recording)
- [ ] OpenF1 historical session parses and renders timing tower + track map
- [ ] Source toggle switches stream without crash or page reload
- [ ] RL gate report: ≥80% of circuits pass gate (or documented why not)
- [ ] `npm run build` exits 0 (zero TS errors)
- [ ] `uv run pytest` all tests pass
- [ ] `docs/codebase-summary.md` mentions all new modules (feeder, openf1_client, design-tokens)
- [ ] `README.md` lists all new `make` targets

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Backfill not complete before phase 10 gate | RL gates are documented as "pending backfill"; dashboard gates are independent |
| TS type errors from new components | Fix during implementation phases; `strict: true` in tsconfig |
| OpenF1 API down during test | Use a cached response fixture for CI; live test is manual only |
| Docs lag behind implementation | Docs update is a step in this phase, not optional |

## Unresolved Questions

- **2025 regulation cutoff**: Are 2025 cars using 2024 or 2026 aero regulations? If 2026
  ground-effect cars are included in 2025 data, calibration must be season-segregated
  (noted in SimParams but needs verification against FastF1 session metadata).
- **OpenF1 `lap_fraction` accuracy**: Position `x,y` coordinates from OpenF1 have unknown
  coordinate system; projection to `lap_fraction` may need per-circuit calibration.
  Fallback: use `lap_number + (lap_duration_fraction)` estimate.
- **PPO gate for street circuits**: Monaco/Singapore/Baku have high SC variance;
  expected that some of these circuits may not pass the 1.5s gate deterministically.
  Document as "SC-variance circuits" rather than forcing retraining indefinitely.
