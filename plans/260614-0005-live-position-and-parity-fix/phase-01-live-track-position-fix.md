---
phase: 1
title: "Live Track Position Fix"
status: complete
priority: P0
---

# Phase 1: Live Track Position Fix

## Overview

Make live driver dots robust by pairing raw `Position.z` with the correct
multiviewer coordinate system and using sector-derived lap progress otherwise.

## Related Code Files

- Modify: `backend/src/f1_strategy/feeder/livef1_feeder.py`
- Modify: `frontend/lib/use-track-geo.ts`
- Modify: `frontend/components/track-map.tsx`
- Add focused backend tests if the backend fallback changes.

## Implementation Steps

1. Store live timing records per driver in `LiveF1Feeder`.
2. Estimate `lap_fraction` from `TimingData.Sectors[*].Segments[*].Status`.
3. Set each live `CarState.lap_fraction` to the sector estimate.
4. Mark `TrackGeo` with whether raw live projection is supported.
5. In `TrackMap`, use raw `x/y` only when geometry supports it; otherwise use
   `lap_fraction`.

## Success Criteria

- Live `RaceState.cars[*].lap_fraction` is meaningful when timing sectors exist.
- Raw live coordinates are not projected onto archive fallback geometry.
- Archive map behavior remains unchanged.

## Open Questions

- Need a live `Position.z` capture to empirically verify map orientation.
