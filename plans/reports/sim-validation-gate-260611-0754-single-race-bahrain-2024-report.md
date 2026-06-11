# Phase 6 Validation Gate Report — Single-Race Run (Bahrain 2024)

**Date:** 2026-06-11 | **Scope:** user-directed single-race verification (full 2024-25
held-out set deferred until archive backfill).

## Result: PASSED (n=1 race)

| Metric | Value | Threshold | Verdict |
|---|---|---|---|
| median abs race-time error | 12.55 s | ≤ 15 s | PASS |
| clean-lap RMSE | 0.452 s/lap | ≤ 0.8 s | PASS |
| Spearman (finishing order) | 0.891 | ≥ 0.85 | PASS |
| classified finishers compared | 10 | ≥ 8 | PASS |

Calibration artifact: `data/calibration/2024/Sakhir.json` (confidence=fitted;
SOFT n=151, HARD n=586 clean laps; pit loss 25.7 s; base 93.38 s; fuel 65.3 ms/lap).

## Runner fix applied during iteration (gate initially FAILED)

First run: RMSE 5.93 s, race-time err 17.2 s. Root cause was metric implementation,
not fit quality — the runner deviated from its own spec ("stint-level RMSE vs real
clean laps"):
1. RMSE compared ALL laps incl. pit in/out laps (sim lumps full pit loss into one lap
   by design; reality splits across in+out) and lap 1. Now: clean green laps only
   (excl. lap 1, SC laps, pit-affected laps). Total pit cost remains judged by the
   race-time metric.
2. Race-time error summed real laps with NaN gaps against the full sim total (bias ≈
   one lap per missing timestamp). Now: both sides summed over the same lap set.

## Caveats

- n=1 race: thresholds met but not statistically meaningful; the gate per plan spec
  (20% held-out 2024-25, stratified by track type) must be re-run after
  `make ingest-backfill`. User explicitly approved proceeding to phase 7 on this
  single-race verification (2026-06-11).
- Bahrain 2024 had no SC — SC modeling path unexercised by this race.
- Lapped cars ("+1 Lap") excluded by the `status == "Finished"` filter; 10 of 20 cars
  compared.

## Unresolved Questions

- HARD deg slope fitted higher than SOFT (101 vs 86 ms/lap) — counterintuitive,
  single-race artifact; recheck after backfill.
