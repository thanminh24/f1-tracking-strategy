---
title: "F1 Dash, Pit Wall UI, Telemetry, Radio, and RL Model Audit"
date: 2026-06-22T22:42:00+07:00
status: complete
type: research-report
---

# Research Report: F1 Dash, Pit Wall UI, Telemetry, Radio, and RL Model Audit

## Contents

1. [Executive summary](#executive-summary)
2. [Scope and methodology](#scope-and-methodology)
3. [F1 Dash deep read](#f1-dash-deep-read)
4. [Current Pit Wall assessment](#current-pit-wall-assessment)
5. [Team radio findings](#team-radio-findings)
6. [RL and simulation audit](#rl-and-simulation-audit)
7. [Comparative decision](#comparative-decision)
8. [Recommended target](#recommended-target)
9. [Delivery sequence](#delivery-sequence)
10. [Sources](#sources)
11. [Unresolved questions](#unresolved-questions)

## Executive summary

The Pit Wall has a good technical core but overstates its finished capability. It already exceeds F1 Dash in archive replay, multi-lap telemetry, statistics, what-if simulation, and ML/RL ambition. F1 Dash remains better at live-session legibility, driver-row density, user settings, delayed-feed synchronization, radio playback, and coherent race-weekend UX.

Do not clone F1 Dash's visual design. Borrow its interaction patterns and raw-feed discipline. Direct code reuse carries AGPL-3.0 obligations. Build a distinct "race engineering workstation" around synchronized driver focus, readable telemetry, radio, race control, and model evidence.

The current model is not proven best. Keep PPO as an experimental baseline only. Its evaluation gate is internally inconsistent, simulator validation covers one reported race, two circuits fail, nine of 21 checkpoints have less than 1.5 positions of reported gain, and the claimed tournament currently runs only two fixed strategies. The RSRL challenger is one 50k-step Barcelona checkpoint and has no complete PPO-vs-RSRL-vs-MC tournament. Model choice is premature; simulator and evaluation correctness are the real bottlenecks.

## Scope and methodology

### Scope

- F1 Dash 4.0.6 architecture, UI, live telemetry, maps, radio, and reusable patterns.
- Current Pit Wall frontend/backend capability and actual running UX.
- Live and archive driver-radio feasibility.
- PPO, RSRL/DRQN, Monte Carlo, behavior model, SC hazard model, simulator fidelity, and promotion evidence.
- Current as of 2026-06-22. Historical sources used where they define the implementation or research baseline.

### Evidence gathered

- Deep-read local F1 Dash 4.0.6 source and current Pit Wall source.
- Verified upstream F1 Dash v4.0.6 is latest release; active repository, ~1.9k stars, AGPL-3.0.
- Ran Pit Wall backend and frontend; inspected home, live, race, telemetry, and stats screens at 1280 and 1920 widths.
- Tested archive radio endpoints on `2026_7_FP1` and `2024_1_R`.
- Queried local model/archive inventory.
- Ran strategy, simulator, and replay integration tests: 48 passed.
- Cross-checked OpenF1 Team Radio and the 2025 RSRL paper.

### Boundaries

- No code changes beyond this report.
- No expensive full retraining.
- No statistically valid new model tournament because the required agent adapters do not exist.
- No live race was active during browser inspection.

## F1 Dash deep read

### Architecture

```text
F1 SignalR Core
  -> Rust negotiate/subscribe client
  -> recursive delta-merged state
  -> realtime HTTP stream
  -> Next.js buffered data engine (200 ms render cadence)
  -> timing, map, weather, race control, radio
```

F1 Dash subscribes to 17 F1 timing topics. `CarData.z` supplies RPM, speed, gear, throttle, brake, and DRS. `Position.z` supplies car coordinates. `TimingData` supplies gaps, sectors, mini-sectors, pit state, and status. `TeamRadio` supplies timestamp, driver number, and audio path.

### What F1 Dash does well

| Pattern | Why useful | Pit Wall status |
|---|---|---|
| Dense driver row with optional car metrics | Race state understood without changing views | Partial; data present, hierarchy cramped |
| Mini-sector and best-sector color grammar | Immediate performance comparison | Present |
| Favorite drivers | Personal focus in a 20-car field | Missing |
| Broadcast delay buffer | Synchronizes dashboard to TV/F1TV | Missing |
| Radio player with driver/time/progress | Low-friction narrative context | Implemented elsewhere, not usable in main layout |
| Track corners and marshal-sector coloring | Better spatial race-control context | Partial; DRS/status present, corner/marshal detail missing |
| Persistent settings and OLED mode | Useful for long viewing sessions | Mostly missing |
| Qualifying elimination treatment | Session-specific information hierarchy | Present |
| Weather radar | Strong operational context | Numeric weather only |

### What not to copy

- Its map fallback estimates position from completed mini-sectors instead of using its commented-out position stream. Pit Wall's raw coordinate path is stronger.
- Its UI is still a timing dashboard, not a strategy workstation.
- Direct source copying is risky: AGPL-3.0 can require corresponding-source obligations for a derivative network application. Reimplement patterns independently; retain attribution where required; obtain legal review before distribution.
- Do not add weather radar, animation, or glass effects before fixing information hierarchy and dead surfaces.

## Current Pit Wall assessment

### Strong foundation

- SignalR Core client and correct delta merge.
- Live raw telemetry and positions.
- FastF1 archive with 54 races: 24 from 2024, 24 from 2025, six from 2026.
- Archive replay with speed controls.
- Track map, DRS overlays, timing tower, mini-sectors, race control, weather.
- Multi-lap speed/throttle/brake/gear traces.
- Sector heatmap, position evolution, pace tables, tyre plans, pit timer.
- Monte Carlo outcomes and what-if backend.

### Observed UX problems

1. **Strategy UI is dead code.** `StrategyPanel` contains model, head-to-head, SC risk, pit window, what-if, and radio, but `RaceView` never mounts it.
2. **The product's differentiator is invisible.** The race view reads as map + timing, not an RL Pit Wall.
3. **Typography is too small.** Important values compete at roughly 9–12 px. At 1920×1080, large empty map space coexists with tiny critical data.
4. **Hierarchy is flat.** Borders and black panels dominate; primary decision, warning, and context states do not form a clear scan path.
5. **Driver focus is fragmented.** Timing selection, map focus, telemetry traces, strategy selection, and radio filtering are not one shared command state.
6. **Layout does not adapt semantically.** Width sliders resize columns but do not provide task presets or collapse low-value content.
7. **Home archive is utilitarian.** It works but lacks weekend state, visual grouping, search/filter, load status, and clear live/archive transition.
8. **Hydration mismatch observed.** Persisted panel widths render different server/client styles.
9. **React style warning observed.** Timing rows mix `border` shorthand and `borderColor` updates.
10. **Archive labels can mislead.** The tested practice replay displayed many gaps as identical values early in playback; uncertainty/approximation is not clearly surfaced.

### Product direction

Make the main unit a synchronized driver focus, not an independent panel collection:

```text
Select driver anywhere
  -> timing row highlight
  -> map camera/label emphasis
  -> live telemetry strip
  -> strategy recommendation + confidence
  -> pit-window/outcome deltas
  -> filtered radio and race-control context
```

Recommended desktop presets:

- **Race:** timing + map + race control + compact radio.
- **Strategy:** focused driver + model/MC comparison + pit window + rivals + what-if.
- **Telemetry:** synchronized traces + delta/reference + track cursor.
- **Qualifying:** tower + mini-sectors + cutoff + speed traps.

Persist preset, focused drivers, density, units, delay, and radio volume. Keep manual resizing as an advanced control.

## Team radio findings

### Live radio: feasible now

Both F1 Dash and Pit Wall subscribe to `TeamRadio`. Each capture has:

```json
{"Utc":"...","RacingNumber":"44","Path":"/TeamRadio/...mp3"}
```

Audio resolves under the F1 static session path. OpenF1 also provides a `team_radio` endpoint with direct `recording_url`; the latest query returned 40 recordings. OpenF1 is the easiest source for replay/history and a useful live fallback.

### Current implementation failures

- The Strategy panel containing `TeamRadioTimeline` is not mounted.
- FastF1 3.8.3 exposes no team-radio API or `_team_radio` property.
- `routes_team_radio.py` relies on the nonexistent private `_team_radio` field.
- Tested archive endpoints returned `[]` for both `2026_7_FP1` and `2024_1_R`.
- Archive radio promises in README/code comments are therefore inaccurate.

### Recommended radio architecture

```text
Live SignalR TeamRadio ----\
                            -> normalized RadioCapture -> cache metadata -> UI player
OpenF1 team_radio ---------/
```

Normalized fields: session, UTC, session time, estimated lap, driver number/code, recording URL, source, availability, optional transcript.

Implementation rules:

- Use SignalR captures in active sessions.
- Use OpenF1 for historical sessions and fallback.
- Cache metadata, not audio, by default.
- Proxy only if browser CORS or hotlink behavior requires it.
- Add one global audio controller so only one clip plays.
- Offer driver/team filters, unread/new indicator, keyboard play/pause, volume, and "jump to race time."
- Treat transcription as optional. It adds cost, delay, error, privacy/licensing questions, and should always show confidence/source.
- Review F1/OpenF1 terms before public redistribution or long-term audio storage.

## RL and simulation audit

### Inventory

| Artifact | Evidence | Verdict |
|---|---|---|
| PPO | 21 per-circuit 2024 checkpoints | Useful prototype baseline |
| PPO eval | 4,100 total simulated episodes | Internally inconsistent gate |
| RSRL/DRQN | Barcelona 2025, 50k steps, 8-lap sequence, 18 features | Early challenger only |
| Behavior LightGBM | 55,769 rows, 1,701 pits, 53 races | Promising; incomplete metrics |
| SC hazard | 12 deployments, logistic model | Too little evidence for confident probability claims |
| Calibration | 49 artifacts: 20 fitted, 29 pooled | Broad coverage; variable fidelity |
| Real-race sim validation | One documented Bahrain 2024 gate | Insufficient generalization evidence |

### PPO evaluation defects

- Documentation states a `>=1.5s` mean-gain gate, but code compares finishing positions.
- `gate_passed` is actually `win_rate >= 0.55 and position_gain > 0`; it never enforces 1.5 seconds.
- Nine of 21 evals have reported position gain below 1.5 positions.
- Montréal fails: -1.20 positions, 33% win rate.
- Silverstone fails badly: -7.17 positions, 1% win rate.
- Evaluation uses only midpoint one-stop and thirds-based two-stop schedules. It does not compare optimized fixed, actual, undercut/overcut, MC, behavior, or oracle strategies.
- Same simulator generates training and evaluation dynamics. This measures simulator exploitation more than real-race quality.
- Per-circuit 2024 models silently serve later seasons, despite regulation, tyre, field, and circuit changes.

### Tournament gap

The baseline contract lists PPO, RSRL, MC, behavior, and fixed agents. The executable tournament CLI passes only `fixed_one_stop` and `fixed_two_stop`. No PPO or MC adapter exists in `evaluation/agents.py`. Existing claims of a full head-to-head tournament are not supported by runnable code.

### Environment/model defects to fix before retraining

1. PPO can repeatedly pit, choose the same compound, and ignore real tyre allocation. Only a zero-stop finish is penalized.
2. RSRL flags invalid actions but still executes them in the parent environment.
3. RSRL observation is built in `super().step()` before used-compound and pit-stop state is updated, creating a one-step state lag.
4. `_last_lap_ms` is reset to base lap time, so its richer temporal feature is not real.
5. Live RSRL inference hardcodes all compounds available and approximates valid finish from pit-stop count.
6. `track_norm` is a hash scalar. Numeric proximity has no racing meaning and can induce false generalization.
7. Rival strategies are simplistic. The behavior path samples one stop only and does not model team coupling, traffic response, undercut, weather reaction, red flags, tyre sets, or strategic adaptation.
8. The simulator is lap-level and linear-degradation based. It omits track evolution, nonlinear cliff, warm-up, compound crossover, pit-lane queue/double-stack, driver pace evolution, overtaking probability by circuit, blue flags, damage, red-flag tyre changes, and weather transitions.
9. SC hazard quality has no stored Brier score, reliability curve, or baseline comparison.
10. Behavior model reports ROC-AUC 0.700 vs 0.648, but pit events are rare. PR-AUC, Brier/calibration, per-track stability, and strategy-rollout impact are missing.

### Is another model automatically better?

No. DRQN/RSRL is a reasonable challenger because strategy is partially observable and temporal. Recurrent PPO is also a strong, simpler comparison. Neither fixes an inaccurate simulator or weak evaluation.

The best near-term system is hybrid:

```text
Calibrated simulator + Monte Carlo / search
  -> candidate actions and outcome distributions
Recurrent policy
  -> fast proposal / ranking
Rules and action mask
  -> legal, operationally valid strategy
Behavior model
  -> realistic opponent response
Uncertainty / out-of-distribution gate
  -> show recommendation or abstain
```

Candidate benchmark set:

- Optimized deterministic strategies and actual historical strategy.
- Rolling-horizon Monte Carlo/search; keep as trusted decision baseline.
- Current PPO after legal-action and evaluation fixes.
- DRQN/RSRL after state correctness fixes.
- Recurrent PPO from SB3 Contrib.
- Behavior cloning/offline policy as a realism baseline, not an optimality claim.

## Comparative decision

| Question | Decision |
|---|---|
| Replace Pit Wall with F1 Dash? | No. Pit Wall has the stronger product foundation. |
| Copy F1 Dash UI? | No. Reimplement selected patterns with a distinct workstation design. |
| Add driver radio? | Yes. Live via SignalR; archive/fallback via OpenF1. |
| Trust current archive radio? | No. It is nonfunctional. |
| Promote RSRL over PPO? | No evidence yet. |
| Call PPO production-ready? | No. Experimental only. |
| Train a larger model now? | No. Fix simulator, actions, gates, and tournament first. |
| Keep Monte Carlo? | Yes. It should remain a primary baseline and uncertainty engine. |

## Recommended target

### UI architecture

- One shared driver-focus store across race, telemetry, strategy, radio, and stats.
- Mount strategy as a first-class preset/tab, not a hidden sidebar.
- Radio dock visible in Race and Strategy modes.
- Compact telemetry sparklines in focused-driver card: speed, throttle, brake, DRS, tyre trend, gap trend.
- Full telemetry: delta trace, synchronized hover cursor, corner/sector annotations, fastest-vs-selected reference, lap validity, zoom.
- Evidence-first model card: action, confidence, outcome delta, assumptions, artifact season, out-of-distribution warning, PPO/RSRL/MC disagreement.
- Minimum readable type scale; reserve 9–10 px for metadata only.
- Use color for state and comparison, not decoration. Add non-color labels/icons.
- Add task presets before more widgets.

### Model architecture

- Simulator and action legality as shared source of truth.
- Explicit train/validation/test splits by season and circuit; never evaluate solely inside training dynamics.
- Paired seeds and bootstrap confidence intervals.
- Cross-track and cross-season matrices.
- Promotion requires real-race sim fidelity, legality, calibration, latency, and improvement over MC/optimized heuristics.
- Abstain when calibration/model season is stale or state is out of distribution.
- Log shadow decisions and disagreements without presenting challenger recommendations as authoritative.

## Delivery sequence

### Phase 0 — Correct claims and restore product surface

1. Mark RL recommendations experimental and surface artifact season.
2. Mount the Strategy view or remove dead feature claims.
3. Replace archive radio route with OpenF1; verify audio playback.
4. Fix hydration/style warnings and establish readable density tokens.

Acceptance: radio works for a known historical session; Strategy tools are reachable; no false "model online" state.

### Phase 1 — Workstation polish

1. Shared driver focus.
2. Race/Strategy/Telemetry/Qualifying presets.
3. Radio dock and unified audio controller.
4. Focused-driver telemetry sparklines and context rail.
5. Favorite drivers, delay, units, OLED/high-contrast preferences.

Acceptance: one click changes every relevant surface; 1280 and 1920 layouts remain readable.

### Phase 2 — Evaluation repair

1. Enforce legal action masks and tyre-set/compound constraints.
2. Fix RSRL feature timing and last-lap inputs.
3. Implement PPO, RSRL, MC, behavior, optimized fixed, and actual-strategy adapters.
4. Run held-out simulator validation across track types and both 2024/2025.
5. Replace ambiguous gate with unit-correct metrics and confidence intervals.

Acceptance: one command produces reproducible cross-season tournament artifacts; failures fail closed.

### Phase 3 — Challenger study

1. Retrain corrected PPO.
2. Train corrected DRQN and Recurrent PPO with equal compute/data.
3. Compare single-track, track-cluster, and multi-track policies.
4. Shadow best challenger against MC/PPO.

Acceptance: promotion only with statistically credible, legal, calibrated improvement across held-out circuits. Otherwise keep MC/PPO baseline.

## Security, performance, and maintainability

- Validate radio URLs against trusted hosts before proxying.
- Rate-limit/cancel archive audio and telemetry requests; never bulk-download audio by default.
- Bound SignalR buffers and radio history.
- Cache normalized radio metadata and track geometry.
- SVG is sufficient for 20 cars; optimize render subscriptions before introducing WebGL.
- Avoid a heavy chart library until synchronized interaction requirements justify it.
- Separate model evidence from presentation so new policies do not require UI rewrites.

## Sources

### Primary repositories and documentation

- [F1 Dash repository](https://github.com/slowlydev/f1-dash) and [v4.0.6 release](https://github.com/slowlydev/f1-dash/releases/tag/v4.0.6)
- [OpenF1](https://openf1.org/) and [OpenF1 Team Radio API](https://api.openf1.org/v1/team_radio?session_key=latest)
- [FastF1 documentation](https://docs.fastf1.dev/)
- [Stable-Baselines3 PPO](https://stable-baselines3.readthedocs.io/en/master/modules/ppo.html)
- [SB3 Contrib Recurrent PPO](https://sb3-contrib.readthedocs.io/en/master/modules/ppo_recurrent.html)

### Research

- Thomas et al., [Explainable Reinforcement Learning for Formula One Race Strategy](https://arxiv.org/abs/2501.04068), SAC 2025, DOI 10.1145/3672608.3707766.

### Local evidence

- `f1-dash-4.0.6/`
- `frontend/app/session/[key]/session-dashboard.tsx`
- `frontend/components/strategy/strategy-panel.tsx`
- `frontend/components/widgets/team-radio-timeline.tsx`
- `backend/src/f1_strategy/api/routes_team_radio.py`
- `backend/src/f1_strategy/strategy/ppo_agent/train.py`
- `backend/src/f1_strategy/sim/gym_env.py`
- `backend/src/f1_strategy/sim/recurrent_gym_env.py`
- `backend/src/f1_strategy/strategy/evaluation/`
- `data/models/`
- `plans/reports/sim-validation-gate-260611-0754-single-race-bahrain-2024-report.md`

## Actionable next steps

1. Implement Phase 0 before visual expansion or retraining.
2. Create a UI polish plan around shared driver focus and four task presets.
3. Create a separate model-evaluation repair plan; do not combine it with UI work.
4. After evaluation repair, run the challenger study and make a promotion decision from evidence.

## Unresolved questions

1. Is this private/local-only, or will it be hosted/distributed? This changes AGPL and F1 audio/data licensing risk.
2. Which display is primary: 1920×1080, ultrawide, laptop, or multi-monitor?
3. Should radio be audio-only, or is transcription/search a real requirement?
4. Is the model objective expected finishing position, expected points, win/podium probability, or team-level two-car outcome?
5. Should the strategy model optimize one driver independently or coordinate both team cars, including double-stack risk?
