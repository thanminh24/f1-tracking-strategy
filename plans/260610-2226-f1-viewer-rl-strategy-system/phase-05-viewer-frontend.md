---
phase: 5
title: Viewer Frontend
status: completed
priority: P2
effort: 6d
dependencies:
  - 4
---

# Phase 5: Viewer Frontend

## Overview
Next.js viewer: archive browser (season→weekend→session), live-style replay dashboard (track map, timing tower, gap chart, tire/stint bars, playback controls), telemetry comparison views.

## Requirements
- Functional: browse archive; open session → replay dashboard streaming from WS; per-driver telemetry traces (speed/throttle/brake/gear vs distance) with 2-driver overlay compare; stint/strategy timeline per race.
- Non-functional: 60fps map animation at 1× replay; dashboard usable on 14" laptop; dark theme default (race-viewing context).

## Architecture
```
frontend/
  app/page.tsx                      → season grid
  app/season/[year]/page.tsx        → weekends
  app/session/[key]/page.tsx        → replay dashboard (main screen)
  app/session/[key]/telemetry/page.tsx → telemetry compare
  components/track-map/             → SVG track outline + animated car dots
  components/timing-tower/          → position list: gap, interval, last lap, tire chip
  components/gap-chart/             → gap-to-leader vs lap (race history chart)
  components/stint-bars/            → horizontal compound-colored stint timeline
  components/telemetry-traces/      → d3/visx line charts, distance-aligned
  components/playback-controls/     → play/pause/speed/seek slider
  lib/ws-replay-client.ts           → typed WS client, reconnect, control msgs
  lib/race-state-store.ts           → zustand store fed by WS ticks
  lib/api-client.ts                 → REST fetchers (typed from schemas)
```
Track map source decision (resolve in step 3): derive outline from one fast-lap telemetry X/Y (archive has it) — render once per session, cache as path. Car dots: lap-fraction interpolation along path from tick data (approximate but smooth) — NOT per-car live coords in v1.

## Related Code Files
- Create: all under `frontend/` per architecture
- Modify: `backend/src/f1_strategy/api/routes_archive.py` (add `GET /api/sessions/{key}/track-outline` returning downsampled X/Y path from fastest lap telemetry)

## Implementation Steps
1. API client + types mirroring backend schemas; archive browse pages (server components, plain fetch).
2. WS client + zustand store; reconnect with replay-status resync.
3. Track outline endpoint (backend) + `track-map` component: SVG path, car dots positioned by `lap + lap_fraction` projected onto path length; rotate/scale to fit.
4. Timing tower + tire chips (compound colors: S red / M yellow / H white / I green / W blue — from constants, not hardcoded per-team).
5. Gap chart (x: lap, y: gap to leader, line per car) updating from ticks; stint bars from stints endpoint.
6. Playback controls wired to WS control messages.
7. Telemetry compare page: driver+lap pickers → fetch traces → distance-aligned overlay charts + delta-time subchart.
8. Polish pass: loading states, error boundaries, keyboard shortcuts (space=play/pause).

## Success Criteria
- [ ] Browse 2024→now archive and open any race
- [ ] Replay dashboard: map dots, tower, gap chart all animate consistently with tick stream
- [ ] Seek + speed changes reflect in UI <500ms
- [ ] Telemetry compare renders 2-driver overlay with delta trace
- [ ] No dropped frames at 1× with 20+ cars (React profiler spot-check)

## Risk Assessment
- SVG re-render thrash with 20 dots × 1Hz ticks + interpolation → animate dots via requestAnimationFrame between ticks, memoize everything else.
- Track outline edge cases (pit lane, chicane overlap) → acceptable cosmetic; outline is decorative not analytical.
