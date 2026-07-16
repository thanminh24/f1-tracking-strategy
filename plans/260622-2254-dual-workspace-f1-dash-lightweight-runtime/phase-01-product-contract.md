---
phase: 1
title: "Product contract"
status: complete
effort: "0.5 day"
---

# Phase 1: Product contract

## Overview

Freeze workspace, deployment, data, and terminology contracts before component work, with Broadcast explicitly defined as the adopted F1 Dash-derived shell and Pit Wall as the advanced operator workspace.

## Implementation Steps

1. Define `WorkspaceMode = broadcast | pit-wall`; default to Broadcast, deep-link it, and persist locally.
2. Define Broadcast as "F1 Dash UI shell plus light modifications" and Pit Wall as "same data engine, denser strategy-first workspace."
3. Share session source/key, focused driver, favorites, delay, playback clock, filters, and connection health across modes.
4. Define capability flags for live, fixture, archive, replay, radio, strategy, what-if, and training; include unavailable reason/remediation.
5. Measure current UI, memory, image-size, and startup baselines before fixing quantitative budgets.
6. Define radio semantics: metadata/URLs only, provider coverage varies, no fabricated transcript.
7. Record the accepted contract in architecture/PDR documentation.

## Success Criteria

- [ ] Contract names ownership and non-goals.
- [ ] Broadcast and Pit Wall responsibilities are distinct and non-conflicting.
- [ ] Workspace switch never reconnects or resets shared context.
- [ ] Capability schema is versioned and testable.
- [ ] Budgets use measured baselines.
