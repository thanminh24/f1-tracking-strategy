---
phase: 4
title: "Deterministic live fixture and shared race-state platform"
status: complete
effort: "2 days"
---

# Phase 4: Deterministic live fixture and shared race-state platform

## Overview

Create a deterministic substitute for an unavailable live race and converge UI consumers on one normalized state platform.

## Implementation Steps

1. Define a small synthetic fixture covering all 17 topics, snapshots, deltas, compressed telemetry/positions, SC/VSC, pits, transitions, and radio metadata.
2. Run fixtures through the production merge/normalization pipeline with play, pause, seek, speed, and deterministic seed.
3. Add a next-session capture runbook; redact/minimize captures and never commit radio audio or unrestricted payloads.
4. Refactor frontend access into source adapter → normalized store → memoized selectors; remove shared-state fetching from views.
5. Centralize focused-driver selection across timing, map, telemetry, strategy, and radio.
6. Test protocol, merge, clock, reconnect, stale state, and source switch.

## Success Criteria

- [ ] Repeated fixture runs yield identical normalized state.
- [ ] Fixture exercises every critical widget and edge state offline.
- [ ] Workspace switching causes no WebSocket reconnect.
- [ ] Fixture validation is never labeled true-live.
