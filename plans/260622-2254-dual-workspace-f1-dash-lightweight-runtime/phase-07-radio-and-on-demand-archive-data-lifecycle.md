---
phase: 7
title: "Radio and on-demand archive data lifecycle"
status: complete
effort: "2 days"
---

# Phase 7: Radio and on-demand archive data lifecycle

## Overview

Make radio reliable when providers publish it and keep historical data opt-in, bounded, and disposable.

## Implementation Steps

1. Remove reliance on FastF1 `_team_radio`; normalize live TeamRadio captures and OpenF1 recordings into one contract.
2. Proxy/redirect audio only when terms allow; handle expired URLs, CORS, limits, late publication, duplicates, and absence.
3. Add driver/time filters and jump-to-event; leave transcription as a separately approved future capability.
4. Add on-demand session acquisition with progress, cancellation, validation, idempotency, and per-session status.
5. Put scratch/cache in a named volume with quota/TTL/LRU and list/purge commands; isolate curated training data.
6. Add provider backoff, timeouts, user-facing errors, and offline radio metadata tests.

## Success Criteria

- [ ] Live/archive radio use one UI contract.
- [ ] No undocumented private FastF1 field remains.
- [ ] Clean default boot downloads zero sessions.
- [ ] Purge cannot delete curated training data.
