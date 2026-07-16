---
phase: 5
title: "Broadcast workspace F1 Dash adoption and modification"
status: complete
effort: "3 days"
---

# Phase 5: Broadcast workspace F1 Dash adoption and modification

## Overview

Adopt the F1 Dash UI shell for the default Broadcast workspace, then lightly modify it so it feels familiar while exposing Pit Wall-specific telemetry, radio, and strategy signals.

## Implementation Steps

1. Import or port the approved F1 Dash UI shell pieces from phase 2: layout, navigation, timing tower framing, map shell, settings affordances, and radio surface.
2. Replace or bridge data hooks so Broadcast runs on Pit Wall state, WebSocket contracts, and capability flags instead of a separate data engine.
3. Define the smallest visual modifications needed: Pit Wall branding, strategy badges, telemetry emphasis, capability states, and workspace switch.
4. Add restrained driver focus, RL action/provenance, pit timer, prediction alert, and radio activity without bloating the F1 Dash scan path.
5. Preserve responsive behavior for 1280, 1440, 1920, and ultrawide layouts.
6. Add keyboard navigation, visible focus, reduced motion, contrast, and minimum 12px operational text.
7. Add deterministic screenshot comparisons at target widths.

## Success Criteria

- [ ] Broadcast is default and recognizable as the adopted F1 Dash-derived workspace.
- [ ] Critical timing content remains readable at 1280px and ultrawide.
- [ ] No duplicate subscription/API logic exists.
- [ ] Fixture interaction, screenshot, and accessibility tests pass.
