# Live Position Tracking and Parity Report

## Summary

Fixed live map positioning fallback and wired live race-control/team-radio data
into existing dashboard surfaces. Archive behavior remains unchanged.

## Changes

- `LiveF1Feeder` now derives live `lap_fraction` from `TimingData.Sectors` so
  cars do not stack at start/finish when raw GPS is missing or unsafe.
- Track geometry now marks whether raw `Position.z` projection is valid. Raw
  live x/y is used only for multiviewer geometry; FastF1 fallback uses
  `lap_fraction`.
- Multiviewer geometry is keyed by circuit/year to avoid stale raw projection
  across live session changes.
- Race-control store now consumes `RaceState.rc_messages`, dedupes by stable
  message identity, and keeps newest messages.
- Team radio timeline now renders live `team_radio_captures` with the
  f1-dash-style `livetiming/static/{SessionInfo.Path}{capture.Path}` URL.
- SC probability history now handles live race-control messages with nullable
  laps and uppercase messages.

## Archive vs Live Function Parity

| Function | Archive | Live | Status |
|----------|---------|------|--------|
| Timing tower | `RaceState.cars` from replay | `RaceState.cars` from SignalR TimingData | Parity |
| Track map | FastF1 outline + `lap_fraction` | Multiviewer + `Position.z`; sector `lap_fraction` fallback | Parity with live-specific GPS |
| Race control strip | Store messages | `RaceState.rc_messages` merged into same store | Parity |
| Team radio | Archive API audio/messages | SignalR `TeamRadio.Captures` audio | Parity for audio; text transcript remains archive-only |
| Telemetry panel | FastF1 lap telemetry | Rolling `CarData.z` telemetry | Partial parity by source type |
| Strategy/RL predictions | `FeederSession._maybe_predict` | same `FeederSession._maybe_predict` path | Parity path confirmed |
| Weather | Archive/weather state | SignalR `WeatherData` mapped to `RaceState.weather` | Parity |
| Stats/championship | Archive stats + predictions | Live state + `ChampionshipPrediction` | Partial; historical archive-only tables remain archive-only |
| Replay controls | play/pause/speed/seek | Hidden/no-op for real-time feed | Intentionally archive-only |
| What-if simulator | Archive timeline-backed API | No live timeline API | Not parity; intentional until live timeline capture exists |

## Validation

- `cd backend && uv run pytest` — 84 passed, 2 warnings.
- `cd frontend && npm run build` — passed.
- Code review subagent found ordering/dedup/stale geometry issues; fixed and
  reran validation.

## Open Questions

- Need active live F1 broadcast to confirm real `Position.z` orientation and RL
  inference behavior during an actual live race.
