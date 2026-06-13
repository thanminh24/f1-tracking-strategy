---
title: "Live Feature Parity + Universal Archive Calendar"
description: "Live side: Position.z / CarData.z streams (track map + telemetry). Archive: FastF1 calendar API so all past sessions are discoverable regardless of local ingest state."
status: pending
priority: P1
branch: "main"
tags: ["live", "archive", "telemetry", "track-map", "rl"]
blockedBy: []
blocks: []
created: "2026-06-13T02:39:56.111Z"
createdBy: "ck:plan"
source: skill
---

# Live Feature Parity + Universal Archive Calendar

## Overview

Two parallel tracks:

**Live parity** — the live session (SignalR via livef1) currently streams timing + tyre data only. Missing:
- Real car x/y positions on track map (`Position.z` topic, zlib-compressed)
- Live per-car telemetry (speed/throttle/brake/gear/RPM/DRS) for Telemetry tab (`CarData.z`)
- Track outline needed for track map even when no local session exists

**Universal archive** — `list_events(year)` queries DuckDB (local only). Users see only 6 of 2026's 24 rounds and have no way to discover sessions they haven't yet downloaded. Fix: add FastF1-backed `/api/calendar/{year}` returning all rounds for any season with a `local: bool` availability flag.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Universal Calendar API](./phase-01-universal-calendar-api.md) | Pending | 3h |
| 2 | [Live Position Tracking](./phase-02-live-position-tracking.md) | Pending | 4h |
| 3 | [Live Telemetry Stream](./phase-03-live-telemetry-stream.md) | Pending | 5h |
| 4 | [Circuit Track Outline Cache](./phase-04-circuit-track-outline-cache.md) | Pending | 2h |
| 5 | [RL Live Data Verification](./phase-05-rl-live-data-verification.md) | Pending | 2h |

## Key Constraints

- No OpenF1 for live data (use livef1 SignalR only)
- `CarData.z` / `Position.z` are zlib+base64 compressed JSON; livef1 `RealF1Client` passes raw bytes
- FastF1 covers calendar 2018–present; livef1 Jolpica only works for current season
- Track outline currently keyed by `session_key`; need circuit-level fallback for live

## Dependencies

Phase 4 (circuit track outline cache) must run before Phase 2 (live positions) — track map needs outline to render positions against.
