---
phase: 2
title: "Live Archive Parity Wiring"
status: complete
priority: P0
---

# Phase 2: Live Archive Parity Wiring

## Overview

Wire live data already present in `RaceState` into the same UI surfaces used by
archive sessions where the behavior makes sense.

## Related Code Files

- Modify: `frontend/lib/race-state-store.ts`
- Modify: `frontend/components/widgets/team-radio-timeline.tsx`
- Read: `frontend/components/race/race-control-strip.tsx`
- Read: `backend/src/f1_strategy/feeder/session_registry.py`
- Read: `backend/src/f1_strategy/strategy/prediction_service.py`

## Implementation Steps

1. Merge `RaceState.rc_messages` into the race-control store queue.
2. Render live `team_radio_captures` from `RaceState` with the livetiming static
   base URL.
3. Confirm predictions are broadcast for live through `FeederSession` just like
   archive.
4. Document intentional non-parity: replay seek/speed controls are archive-only.

## Success Criteria

- Live race-control strip shows live `rc_messages`.
- Live team-radio timeline can show live captures without archive API calls.
- RL broadcast path parity is documented with source references.

## Open Questions

- Actual live RL inference still depends on model availability for the current
  circuit and a broadcasting live session.
