---
phase: 10
title: "Verification release gates and true-live validation"
status: in_progress
effort: "2 days plus one live session"
---

# Phase 10: Verification release gates and true-live validation

## Overview

Gate release with deterministic, container, UI, model, and eventual real-session evidence.

## Implementation Steps

1. Run backend unit/contracts, frontend lint/type/compile, fixture protocol tests, and both profiles.
2. Run browser flows for boot, workspace switch, driver focus, radio, pit strategy, missing capabilities, reconnect, and on-demand lifecycle.
3. Run screenshot baselines, accessibility checks, and update-load profiling at supported widths.
4. Assemble from a clean tree, verify adopted F1 Dash UI obligations/notices are present when applicable, scan images, assert forbidden packages/data absent, and measure size/RSS/startup.
5. Execute model parity/benchmark gates; keep PPO labeled baseline until challenger criteria pass.
6. At the next active session, run capture/runbook and compare real deltas, compression, radio timing, and reconnects with fixture assumptions.
7. Use distinct labels: fixture-validated, archive-validated, true-live-validated.
8. Update README, architecture, deployment, design, roadmap, and changelog with verified commands/behavior.

## Success Criteria

- [ ] Deterministic/container gates pass from clean checkout.
- [ ] No critical accessibility, security, contract, or parity failures remain.
- [ ] Release notes state exact validation levels.
- [ ] True-live validation requires an actual broadcast session.
