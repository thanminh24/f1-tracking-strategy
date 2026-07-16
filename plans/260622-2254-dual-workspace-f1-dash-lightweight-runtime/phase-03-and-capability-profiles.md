---
phase: 3
title: "Capability profiles and API boundary"
status: complete
effort: "1 day"
---

# Phase 3: Capability profiles and API boundary

## Overview

Make optional services explicit so one frontend works against live-core and analysis runtimes.

## Implementation Steps

1. Split eager FastAPI registration into live-core and optional archive/strategy router factories under one stable API namespace.
2. Add `GET /api/capabilities` with profile, enabled features, provider health, model availability, and cache policy; expose no secrets/paths.
3. Remove archive imports from live startup; absent optional packages must not prevent API boot.
4. Add frontend capability state and reusable unavailable/loading/error presentations.
5. Normalize timing, position, telemetry, incident, radio, and strategy contracts across live, fixture, and replay.
6. Contract-test both profiles and backward-compatible missing fields.

## Success Criteria

- [ ] Live-core imports/boots with only live dependencies.
- [ ] Frontend never calls disabled routes blindly.
- [ ] Optional failures do not break timing/map.
- [ ] Contract tests cover both manifests.
