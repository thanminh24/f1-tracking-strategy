---
phase: 6
title: "Professional Pit Wall workspace and strategy integration"
status: complete
effort: "3 days"
---

# Phase 6: Professional Pit Wall workspace and strategy integration

## Overview

Turn the current dense UI into a decision workspace that deliberately diverges from the F1 Dash Broadcast shell and mounts the existing strategy surface as a first-class feature.

## Implementation Steps

1. Audit widgets by operator task: race overview, strategy, telemetry, qualifying, incidents, statistics.
2. Add task presets/subviews instead of one infinitely dense dashboard, using the shared workspace switch as the entry from Broadcast.
3. Mount `frontend/components/strategy/strategy-panel.tsx`; connect driver/session, provenance, confidence, staleness, and capabilities.
4. Keep raw evidence beside recommendations; label baseline, challenger, heuristic, simulated, and unavailable output.
5. Add selected-driver/lap telemetry comparison and synchronized cursor/track position where supported.
6. Preserve context across workspace/preset switches and deep links.
7. Test stale model, missing circuit, archive/radio absence, partial telemetry, and reconnect.

## Success Criteria

- [ ] Operator can move event → driver → evidence → recommendation without losing context.
- [ ] StrategyPanel is reachable and no longer orphaned.
- [ ] Recommendations expose model/version/confidence/staleness.
- [ ] Switching from the F1 Dash-derived Broadcast view preserves context and keyboard operation.
