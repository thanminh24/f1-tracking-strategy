---
phase: 2
title: "Frontend Live State (CarData+Position)"
status: pending
priority: P0
effort: "2h"
dependencies: [1]
---

# Phase 2: Frontend Live State (CarData+Position)

## Overview

Wire the 17 new live topics from Phase 1 into the frontend. The backend now broadcasts `car_telemetry`, `car_positions`, `driver_list`, `track_status`, `weather`, `race_control_messages`, `team_radio`, etc. The frontend `race-state-store.ts` must accept and expose these fields, and existing components (timing tower, track map, weather, team radio) must consume them when in live mode.

## Related Code Files

- Modify: `frontend/lib/race-state-store.ts` (add all new live fields)
- Modify: `frontend/lib/types.ts` (add TypeScript types for all 17 topics)
- Modify: `frontend/lib/feeder-client.ts` (parse new fields from WS message)
- Modify: `frontend/components/track-map.tsx` (consume `car_positions` for live driver dots)
- Modify: `frontend/components/timing-tower.tsx` (consume `driver_list` for live driver info)
- Modify: `frontend/components/strategy/strategy-panel.tsx` (consume `weather` live data)
- Modify: `frontend/app/session/[key]/session-dashboard.tsx` (pass live state to components)

## Implementation Steps

1. **Add TypeScript types to `types.ts`** for all 17 topics. Mirror f1-dash's `state.type.ts`:
   - `DriverList: { [racingNumber: string]: Driver }` where `Driver` has `TeamColour`, `Tla`, `FullName`, `HeadshotUrl`, `CountryCode`
   - `CarTelemetry: { [racingNumber: string]: { Channels: { "0":rpm, "2":speed, "3":gear, "4":throttle, "5":brake, "45":drs } } }`
   - `CarPositions: { [racingNumber: string]: { Status: string, X: number, Y: number, Z: number } }`
   - `TrackStatus: { Status: string, Message: string }`
   - `WeatherData: { AirTemp, Humidity, Pressure, Rainfall, TrackTemp, WindDirection, WindSpeed }` (all strings)
   - `RaceControlMessages: { Messages: RCMessage[] }` where `RCMessage` has `Utc, Lap, Message, Category, Flag?, Scope?, Sector?`
   - `TeamRadio: { Captures: { Utc, RacingNumber, Path }[] }`
   - `ChampionshipPrediction: { Drivers: {...}, Teams: {...} }`
   - `ExtrapolatedClock: { Utc: string, Remaining: string, Extrapolating: boolean }`
   - `LapCount: { CurrentLap: number, TotalLaps: number }`
   - `TimingAppData: { Lines: { [nr: string]: { Stints: Stint[], GridPos: string } } }`
   - `Stint: { TotalLaps?: number, Compound?: "SOFT"|"MEDIUM"|"HARD"|"INTERMEDIATE"|"WET", New?: string }`

2. **Extend `race-state-store.ts`**:
   - Add fields: `carTelemetry`, `carPositions`, `driverList`, `trackStatus`, `weather`, `raceControlMessages`, `teamRadio`, `championshipPrediction`, `extrapolatedClock`, `lapCount`, `timingAppData`, `timingStats`, `sessionData`
   - All optional/null initially
   - Add setters for each (or a single `mergeLiveState(partial)` setter)

3. **Update `feeder-client.ts`**:
   - When a WS message arrives from `/ws/feed/live`, parse all new fields from the payload and call the store setters
   - `CarData.z` / `Position.z` arrive pre-decoded from backend (backend inflates before broadcast); frontend just reads them as plain dicts

4. **Track map live driver dots** (`track-map.tsx`):
   - In live mode, use `carPositions` (X, Y from SignalR) instead of interpolated archive positions
   - Driver color from `driverList[nr].TeamColour`
   - Driver label from `driverList[nr].Tla`
   - Pit status from `timingData.Lines[nr].InPit`

5. **Timing tower live driver info** (`timing-tower.tsx`):
   - Use `driverList` for driver name/team color when live (current code uses archive session metadata)
   - Fall back gracefully to archive data when `driverList` is null

6. **Weather widget** (`strategy-panel.tsx` or dedicated widget):
   - Consume `weather` (WeatherData) for live AirTemp, TrackTemp, Rainfall, WindSpeed
   - Already have weather display — just swap data source when `weather !== null`

7. **Team radio** — existing `team-radio-timeline.tsx` uses archive paths; in live mode use `teamRadio.Captures` where `Path` is relative to `https://livetiming.formula1.com/static/{session_path}/`
   - Get `session_path` from `SessionInfo.Path` in the live state

## Success Criteria

- [ ] In live mode, driver dots on track map move using `car_positions` X/Y coordinates
- [ ] Timing tower shows driver names/team colors from `driver_list` (not stale archive data)
- [ ] Weather widget shows live air temp and track temp
- [ ] No TypeScript compile errors (`npm run build` clean)
- [ ] All new store fields are `undefined` (not error) when no live session active

## Risk Assessment

- **Coordinate scale**: `Position.z` X/Y are in the same coordinate space as multiviewer map API (Phase 3); verify scale matches before rendering dots
- **Live vs archive branch**: gate all new live-field consumption on `sessionKey === "live"` to avoid polluting archive replay
