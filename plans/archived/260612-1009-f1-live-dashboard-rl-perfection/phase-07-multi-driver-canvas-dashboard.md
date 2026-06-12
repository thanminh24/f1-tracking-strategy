---
phase: 7
title: "Multi-Driver Canvas Dashboard"
status: pending
priority: P1
effort: "5-7h"
dependencies: [4, 6]
---

# Phase 7: Multi-Driver Canvas Dashboard

## Overview

Redesign the main race view into a full multi-driver dashboard with four panels: Canvas2D
track map (60fps), timing tower, gap chart, and telemetry overlay. All panels are
source-agnostic — they consume `RaceState` ticks from `FeederClient` regardless of whether
the source is archive or live.

The existing components are functional but visually minimal and use SVG for the track map
(which caps at ~30fps due to DOM re-renders). This phase replaces SVG with Canvas2D for
the track map and adds synchronized multi-driver telemetry.

## Requirements

**Functional:**
- **Track map** (Canvas2D, 60fps): car dots with team colors, position numbers, smooth
  interpolated motion between 1Hz ticks, sector-color track outline, DRS zone markers,
  SC/VSC overlay (full track turns amber/yellow)
- **Timing tower**: all 20 drivers, team-color left border, position, driver code, gap to
  leader, interval, last lap time, tire compound badge + age, pit count, fastest-lap purple
- **Gap chart** (d3 line chart): gap-to-leader time-series per driver, team colors,
  lap-number x-axis, hover tooltip, scrub bar synced to replay position
- **Telemetry overlay**: speed, throttle %, brake %, gear for up to 4 selected drivers,
  multi-line chart synced by lap fraction, driver selector chips
- **Stint bars**: horizontal bars per driver showing compound + age, current lap marker
- **Layout**: 3-column grid at ≥1280px; track map left-center, timing tower right,
  gap chart + telemetry below map, stint bars below timing

**Non-functional:**
- Track map Canvas2D renders at 60fps using `requestAnimationFrame`; interpolates
  car positions between 1Hz WS ticks for smooth motion
- No d3 in track map — pure Canvas2D for performance
- Gap chart: d3 only, not canvas (line chart updates at 1Hz, no need for 60fps)
- All panels share single `useRaceStateStore` Zustand store (existing)

## Architecture

```
Layout (1280px+):
┌─────────────────────────────┬──────────────────┐
│  TRACK MAP (Canvas2D 60fps) │  TIMING TOWER    │
│  700px × 700px              │  20 rows × 28px  │
│  sector colors              │  team color left │
│  car dots + numbers         │  gap/interval    │
│  DRS zone markers           │  tire badge      │
├─────────────────────────────┼──────────────────┤
│  GAP CHART (d3)             │  STINT BARS      │
│  gap-to-leader time series  │  20 drivers      │
│  scrub bar                  │  per-compound    │
├─────────────────────────────┴──────────────────┤
│  TELEMETRY OVERLAY (d3 multi-line)              │
│  speed/throttle/brake/gear · driver chips      │
└─────────────────────────────────────────────────┘

Track Map interpolation:
  1Hz WS tick → store prev + next CarState
  rAF loop: fraction = (now - lastTick) / 1000ms
  dot_x = lerp(prev.x, next.x, fraction)
  Canvas.clearRect + redraw all dots each frame
```

**Car position projection (reusing existing `geo.at(frac)`):**
- Keep the `useMemo` arc-length computation from existing `track-map.tsx`
- Move to a shared `useTrackGeo(sessionKey)` hook
- Canvas2D draws: track path once (static layer), cars every frame (dynamic layer)
- Two canvas layers (static + dynamic) via CSS absolute positioning

## Related Code Files

- Modify: `frontend/components/track-map.tsx` → rewrite as Canvas2D (keep file, replace SVG)
- Modify: `frontend/components/timing-tower.tsx` → styled redesign (no behavior change)
- Modify: `frontend/components/gap-chart.tsx` → scrub bar + team colors
- Modify: `frontend/components/stint-bars.tsx` → visual redesign
- Modify: `frontend/components/telemetry-traces.tsx` → multi-driver overlay
- Create: `frontend/lib/use-track-geo.ts` — extracted geo hook (was inline in track-map)
- Create: `frontend/lib/use-canvas-loop.ts` — `requestAnimationFrame` hook with cleanup
- Modify: `frontend/app/session/[key]/replay-dashboard.tsx` — new 3-column grid layout
- Modify: `frontend/lib/race-state-store.ts` — add previous state for interpolation

## Implementation Steps

### Track Map (Canvas2D)

1. **Extract `useTrackGeo`** from existing `track-map.tsx` into `lib/use-track-geo.ts`
2. **Create `lib/use-canvas-loop.ts`** — `useEffect` that calls `rAF` in a loop,
   returns `canvasRef`; cleans up on unmount
3. **Rewrite `track-map.tsx`** with two canvas elements (absolute stacked):
   - `staticCanvas`: draw track outline once when `geo` changes (or on first load)
   - `dynamicCanvas`: `rAF` loop — `clearRect`, draw each car dot + position number
4. **Add interpolation** — store `prevState` + `prevTickTime` in ref; lerp `lap_fraction`
   between ticks at 60fps
5. **Sector colors** — divide track path into 3 equal arc segments; color each sector
   from `state.sector_flags` if present, else uniform track status color
6. **DRS zones** — draw thicker green segments at known DRS detection/activation points
   (hardcode top 10 circuits; load from static JSON for all circuits)
7. **SC overlay** — when `track_status` is SC/VSC: draw amber halo around full track path

### Timing Tower

8. **Redesign `timing-tower.tsx`** — keep grid layout; update to design tokens:
   - Team color 3px left border (CSS `border-left`)
   - `gap_leader_s < 1.0` → text-amber-400 (undercut alert proximity)
   - Fastest lap row → left border `#BF00FF` (purple)
   - `status === "pitting"` → `PIT IN` amber badge
   - Tire compound badge: pill shape, compound letter + age, compound background colors

### Gap Chart

9. **Update `gap-chart.tsx`** — add scrub bar below chart (input[type=range] synced to
   `feederClient.seekLap`); driver lines use team colors; hover tooltip shows driver + gap

### Telemetry Overlay

10. **Rewrite `telemetry-traces.tsx`** — multi-driver line chart using d3:
    - 4 sub-charts stacked: Speed (km/h), Throttle (%), Brake (%), Gear (1-8)
    - X-axis: lap fraction (0-1) synced across all 4 charts
    - Driver chips above chart: click to toggle, max 4 selected, team-color pill
    - Data from REST `GET /api/sessions/{key}/telemetry/{car_id}/{lap}` (existing endpoint)

### Layout

11. **Redesign `replay-dashboard.tsx`** — new 3-column CSS grid layout using `Panel` wrapper
12. **Responsive breakpoints**: below 1024px → stack track map + timing tower vertically

## Success Criteria

- [ ] Track map renders at 60fps (Chrome devtools → Performance shows ≤16ms frame time)
- [ ] Car dots interpolate smoothly between 1Hz WS ticks (no snapping/teleporting)
- [ ] Timing tower shows all 20 drivers with correct team colors and tire badges
- [ ] Fastest lap row highlighted in purple; pitting badge shown correctly
- [ ] Gap chart scrub bar seeks archive replay to correct lap on drag
- [ ] Telemetry overlay shows up to 4 drivers; driver chips toggle correctly
- [ ] Stint bars update in sync with timing tower
- [ ] Layout holds at 1280px; panels stack at 1024px
- [ ] No Canvas2D memory leaks (no canvas created without cleanup on unmount)

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| 60fps Canvas loop causes CPU spike with 20 cars | Profile; reduce to 30fps if needed; only redraw dirty region |
| Track outline data unavailable for some circuits | Fallback to blank canvas with car number list |
| d3 gap chart re-renders lag at 1Hz with 20×70 lap points | Use d3 `.datum()` update pattern; clip to last 30 laps by default |
| DRS zone coordinates hardcoded = wrong after circuit changes | Mark as best-effort; add disclaimer in UI |
| `interpolateCarPosition` desync when replay seeks | Reset `prevState` and `prevTickTime` on seek |
