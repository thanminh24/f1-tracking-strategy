---
phase: 12
title: "Full Telemetry View — Driver Picker, All Laps, Live-Adaptive"
status: pending
priority: P1
effort: "2d"
dependencies: [11]
---

# Phase 12: Full Telemetry View — Driver Picker, All Laps, Live-Adaptive

## Overview

Replace the current multi-driver/multi-lap slot picker (up to 6 trace slots, complex UX)
with a driver-first view: pick a driver, see all their laps stacked on one chart. A secondary
driver overlay is optional for side-by-side comparison. The view auto-adapts between archive
mode (all laps available upfront) and live mode (laps stream in as the race runs).

## Requirements

### Layout

```
┌────────────────────────────────────────────────────────────┐
│ DRIVER PICKER  [HAM ▾]  vs  [+Add driver ▾]               │
│ LAP FILTER     [All laps] [Fastest 5] [Custom range 1-78]  │
│ CHANNEL PICKER [Speed ✓] [Throttle ✓] [Brake ✓] [Gear ✓]  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  MULTI-LAP TRACES (SVG, stacked or overlaid)              │
│  — X axis: distance 0 → track_length meters               │
│  — Y axis: per channel (speed 0-350, throttle 0-100, …)   │
│  — each lap = one colored line; lighter shade for older    │
│  — hover: crosshair snaps to nearest point, shows tooltip  │
│    with speed/gear/throttle/brake at that distance         │
│  — fastest lap highlighted with thicker stroke             │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ MINI SECTOR STRIP  S1 ██████ 22.1s  S2 ████ 18.3s  S3 …  │
└────────────────────────────────────────────────────────────┘
```

### Driver Picker
- Dropdown populated from `RaceState.cars` keys (car numbers → team + name)
- "Primary driver" always shown; "Secondary driver" optional (null = single-driver mode)
- When secondary driver selected: both trace sets overlaid, primary in solid, secondary in dashed

### Lap Display
- **All laps** (default): every lap for the selected driver in the session
- **Fastest 5**: auto-selects the 5 fastest completed laps by `lap_time`
- **Custom range**: two number inputs `from lap` / `to lap`
- Lap color gradient: oldest lap = 30% opacity, newest/fastest = 100%

### Live Adaptive Mode
- In live source: lap list updates in real-time as new `LapRow` entries arrive via WebSocket `lap_completed` events (or polling fallback via `api.laps()` every 10s)
- Current in-progress lap shown as a partial/dashed line using the latest telemetry samples streamed via WS
- In archive source: all laps available immediately from prefetched `laps` prop

### Channel Configuration
- Available channels: `speed`, `throttle`, `brake`, `gear`, `drs`, `rpm`
- Default visible: `speed`, `throttle`, `brake`
- Channel toggles in header chips; toggling hides/shows that trace row
- Channels rendered as separate horizontal bands (not overlaid on one axis) for clarity

### Mini Sector Strip
- Shows sector times (S1/S2/S3) for the highlighted/hovered lap
- Green = personal best sector, purple = overall best sector (if fastest lap data available)

### Non-functional
- Pure SVG rendering (no Recharts) — avoids 40KB bundle for one chart
- Maximum 20 laps rendered at once; "Load more laps" button if session has >20
- Render time target: <10ms for 20 laps × 300 distance samples = 6000 points

## Architecture

```
app/session/[key]/session-dashboard.tsx
  └─ TelemetryView (tab="telemetry")
       ├─ TelemetryHeader (driver/lap/channel pickers)
       │    ├─ DriverPicker
       │    ├─ LapFilterBar
       │    └─ ChannelToggleBar
       ├─ MultiLapTracesChart (SVG, per-channel bands)
       └─ SectorTimeStrip
```

Data flow:
```
LapRow[] (from page prefetch + live updates)
  → filter by selected car_id + lap range
  → for each lap: fetch TelemetrySample[] via api.telemetry(key, carId, lap)
  → cache fetched samples in useRef Map<`${carId}-${lap}`, TelemetrySample[]>
  → pass to MultiLapTracesChart
```

Telemetry fetch strategy:
- Fetch on-demand when lap becomes selected; cache result in component-level `useRef` Map
- Parallel fetch up to 5 laps at a time (Promise.all with slice)
- Show loading skeleton per lap while fetching

## Related Code Files

- Modify: `frontend/app/session/[key]/session-dashboard.tsx` — replace `TelemetryCompare` with new `TelemetryView` in telemetry tab
- Create: `frontend/components/telemetry/telemetry-view.tsx` — top-level container + pickers + chart
- Create: `frontend/components/telemetry/multi-lap-traces-chart.tsx` — SVG multi-channel, multi-lap chart
- Create: `frontend/components/telemetry/sector-time-strip.tsx` — S1/S2/S3 color-coded bar
- Modify: `frontend/lib/api-client.ts` — ensure `api.laps()` and `api.telemetry()` exist (already present)
- Delete: `frontend/components/telemetry/telemetry-compare.tsx` — replaced by new view
- Delete: `frontend/app/session/[key]/telemetry/` — old sub-page no longer needed

## Implementation Steps

1. Create `telemetry-view.tsx` with `DriverPicker`, `LapFilterBar`, `ChannelToggleBar` in a compact header row
2. Implement telemetry cache pattern: `useRef<Map<string, TelemetrySample[]>>()` keyed by `${carId}-${lap}`; fetch missing laps on selection change
3. Build `MultiLapTracesChart`:
   - Compute distance domain (0 → max dist across all samples)
   - For each visible channel: render an SVG band (stacked vertically, equal height)
   - For each lap in selection: render polyline with opacity gradient (oldest=0.3, newest=1.0)
   - Fastest lap: `stroke-width: 2` vs `1` for others
   - Hover handler: binary search by dist to find nearest point; show tooltip
4. Build `SectorTimeStrip`: reads sector times from `LapRow.sector1_ms`, `sector2_ms`, `sector3_ms`; colors green/purple per personal/session best
5. Live mode: poll `api.laps(key)` every 10s and merge new rows into state; highlight latest partial lap
6. Wire into `session-dashboard.tsx` `telemetry` tab (replace old `TelemetryCompare`)
7. Remove `telemetry-compare.tsx` and old telemetry sub-page after migration

## Success Criteria

- [ ] Driver picker renders all drivers from current race state
- [ ] Selecting a driver + All Laps renders traces for every completed lap
- [ ] Fastest 5 filter correctly identifies and highlights the 5 best lap times
- [ ] Channel toggles hide/show trace bands without layout shift
- [ ] Hover crosshair snaps to nearest dist point and shows speed/gear/throttle values
- [ ] Fastest lap shown with thicker stroke
- [ ] In live mode: new laps appear within 10s of completion
- [ ] Sector strip shows correct S1/S2/S3 times for the hovered lap; green = PB, purple = session best

## Risk Assessment

- `LapRow` may not have `sector1_ms` / `sector2_ms` / `sector3_ms` fields in current schema — check `types.ts` and add; backend query may need updating
- Telemetry samples can be large (300-500 points per lap); fetching 20 laps = up to 10k points — cache is essential; add loading skeleton per lap to avoid blocking UI
- Live partial-lap telemetry: if the WS does not stream intra-lap telemetry, the partial dashed line will not be possible — degrade gracefully to "waiting for lap completion"
