---
phase: 8
title: "Strategy UI + What-If Explorer"
status: completed
priority: P2
effort: "5d"
dependencies: [5, 7]
---

# Phase 8: Strategy UI + What-If Explorer

## Overview
Surface the strategy brain in the viewer: strategy overlay on the replay dashboard (recommended actions, pit windows, undercut alerts, SC probability, outcome probabilities) + interactive what-if panel. Everything rendered as probabilities/distributions — no deterministic claims in UI copy.

## Requirements
- Functional: per-driver strategy card; pit-window bands on gap chart; undercut-threat alerts; SC probability gauge; live outcome-probability table; what-if: pick car + action → projected classification delta.
- Non-functional: prediction updates render <200ms after WS message; UI degrades gracefully when predictions absent (pre-phase-7 replays or models disabled); every probability shows sample basis on hover (n rollouts, model version).

## Architecture
```
components/strategy-overlay/
  driver-strategy-card.tsx      → recommended action chip + action probs + pit-window mini-dist
  pit-window-bands.tsx          → probability-shaded lap bands overlaid on gap-chart
  undercut-alert-toast.tsx      → fired when rival pit P(undercut succeeds) crosses threshold
  sc-probability-gauge.tsx      → P(SC) next 1/5 laps, trend sparkline
  outcome-probability-table.tsx → sortable: P(win), P(podium), P(points), expected position
components/what-if-panel/
  what-if-form.tsx              → car picker, action picker (pit now + compound / stay out N laps)
  what-if-result.tsx            → before/after position distributions (violin/bar), Δ expected position
lib/prediction-store.ts         → zustand slice fed by {"type":"predictions"} WS messages
lib/whatif-client.ts            → POST /api/whatif wrapper with abort/spinner handling
```
UX copy rules (enforce in components): always "P(...) = 23%", "likely window: laps 18-22 (68%)"; never "will pit lap 20". Confidence metadata in tooltips. Color scale for probability bands defined once in theme constants.

## Related Code Files
- Create: all under `frontend/components/strategy-overlay/`, `frontend/components/what-if-panel/`, `frontend/lib/{prediction-store.ts, whatif-client.ts}`
- Modify: `frontend/app/session/[key]/page.tsx` (overlay layout integration, toggle panel)
- Modify: `frontend/lib/ws-replay-client.ts` (route predictions messages to prediction-store)

## Implementation Steps
1. prediction-store + WS routing; typed `PredictionSet` mirror of backend schema.
2. Outcome table + SC gauge (pure renders of store state).
3. Driver strategy cards (compact grid, expand on click) + recommended-action chips.
4. Pit-window probability bands integrated into existing gap chart; undercut alert logic (threshold from config, dismissible toasts, no alert spam: cooldown per car pair).
5. What-if panel: form → API → result viz; show loading rollout count; allow comparing 2 scenarios side by side.
6. Empty/degraded states: no-predictions banner; stale-prediction indicator if last update > 2 laps old.
7. End-to-end demo run: full replay of a strategic race (2024 Monza or 2025 equivalent) with all overlays on — record GIF/screenshots into `docs/`.

## Success Criteria (260611 — browser-session items pending manual demo run, marked 🖥)
- [x] Overlay components wired to predictions WS stream (zustand store, lap-keyed updates,
      late-joiner snapshot); 🖥 visual live-update pass pending demo run
- [x] What-if backend round trip ≈1.2s (2× ~300-rollout MC) — well under 4s with render
- [x] UI copy audit clean: grep "will pit|will happen|will win|guaranteed" → 0 hits;
      all copy probabilistic ("P(...) = NN%", "likely window: laps A-B (NN%)")
- [ ] 🖥 60fps with overlays + 20 cars — needs browser profiling session
- [x] Degraded mode: no-predictions banner; stale flag (>2 laps, seek-safe);
      F1_PREDICTIONS=0 disables service; missing artifacts degrade to viewer-only

## Implementation Notes (260611)
- components/strategy-overlay/: strategy-panel (container, cards/what-if toggles),
  sc-probability-gauge (+sparkline), outcome-probability-table (sortable),
  driver-strategy-cards (chips + pit-window phrasing), undercut-alert-toasts
  (3.5s range, P≥0.35 within 2 laps, 5-lap pair cooldown).
- Pit-window bands drawn inside existing gap-chart as P(any pit|lap) opacity bands.
- what-if-panel: car/action form → abortable POST → baseline vs forced cards, pinnable.
- lib/: prediction-types.ts (schema mirror), prediction-store.ts (zustand + SC history),
  whatif-client.ts; ws-replay-client routes {"type":"predictions"}.

## Risk Assessment
- Information overload on one screen → overlay panels toggleable; default ON: SC gauge + outcome table; cards/bands opt-in.
- Probability UX misread as certainty → copy rules above + tooltips; spot-test with a non-developer viewer if possible.
