---
phase: 3
title: "Validation and Report"
status: complete
priority: P0
---

# Phase 3: Validation and Report

## Overview

Run targeted checks and produce a concise parity report.

## Validation

- `cd backend && uv run pytest`
- `cd frontend && npm run build`
- Optional when live session is active: connect to `/session/live?source=live`
  and confirm moving track dots plus predictions.

## Report Requirements

- List fixed files.
- List archive functions and live status.
- List unresolved questions at end.

## Open Questions

- Live broadcast availability may block real race validation today.
