---
title: "Dual-Workspace F1 Dash UI Adoption and Lightweight Runtime"
description: "Adopt and lightly modify the F1 Dash UI as the Broadcast workspace, layer a professional Pit Wall workspace on the same data engine, and keep Docker delivery lightweight."
status: in_progress
priority: P0
branch: "main"
tags: [frontend, telemetry, live, radio, rl, docker]
blockedBy: []
blocks: []
created: "2026-06-22T15:54:17.632Z"
createdBy: "ck:plan"
source: skill
---

# Dual-Workspace F1 Dash UI Adoption and Lightweight Runtime

## Overview

Create two UI compositions over one race-state, telemetry, radio, and strategy platform. Broadcast is the default F1 Dash-derived workspace with light Pit Wall branding and data additions; Pit Wall is the dense professional workspace. Default deployment is live-only with no historical cache. A deterministic fixture replaces unavailable race-weekend data for development, but never counts as true-live validation.

## Decisions

- Two workspaces, not two applications: stores, selectors, adapters, and headless widgets stay shared.
- Prefer adopting the F1 Dash UI shell directly, then lightly modifying it to surface Pit Wall telemetry, strategy, and radio workflows. If licensing/public-distribution constraints block this, fall back to clean-room recreation.
- Default profile is live-core. Archive, training, and heavyweight model dependencies stay optional.
- No race data ships in images. On-demand data uses a named volume, bounded cache, explicit purge, and observable download state.
- Radio means official live capture metadata/audio URLs and OpenF1 archive recordings when available; no universal coverage or invented transcripts.
- PPO stays a baseline until walk-forward, multi-circuit, seeded challenger evaluation proves otherwise.

## Target architecture

```text
SignalR / fixture / OpenF1 / FastF1 on demand
                    |
          normalized backend contracts
                    |
        shared Zustand state + selectors
             /                  \
  Broadcast workspace       Pit Wall workspace
  familiar race overview    decisions + analysis
```

| Profile | Includes | Excludes |
|---|---|---|
| Live, default | web, live API/WS, radio metadata, fixture | historical cache, archive analytics, Torch |
| Analysis | live plus archive/replay/strategy runtime | bundled race data |
| Training | analysis plus SB3/PyTorch/Gym tooling | production deployment |

## Acceptance criteria

- `docker compose up` reaches a healthy default UI/API from a clean checkout without downloading a race.
- Broadcast defaults on; switching to Pit Wall preserves session, driver focus, delay, and filters.
- Both workspaces render fixture data and degrade honestly from `/api/capabilities`.
- Live-core contains no Torch, SB3, FastF1, pandas, PyArrow, SciPy, or DuckDB.
- Strategy either passes exported-policy parity gates or remains in the optional analysis image.
- F1 Dash UI adoption cannot proceed past phase 2 without a documented AGPL/trademark/distribution decision.
- True-live sign-off waits for a real race-weekend runbook.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Product contract](./phase-01-product-contract.md) | Complete |
| 2 | [Licensing and adoption boundary](./phase-02-licensing.md) | Complete |
| 3 | [Capability profiles and API boundary](./phase-03-and-capability-profiles.md) | Complete |
| 4 | [Deterministic live fixture and shared race-state platform](./phase-04-deterministic-live-fixture-and-shared-race-state-platform.md) | Complete |
| 5 | [Broadcast workspace F1 Dash adoption and modification](./phase-05-broadcast-workspace-visual-recreation.md) | Complete |
| 6 | [Professional Pit Wall workspace and strategy integration](./phase-06-professional-pit-wall-workspace-and-strategy-integration.md) | Complete |
| 7 | [Radio and on-demand archive data lifecycle](./phase-07-radio-and-on-demand-archive-data-lifecycle.md) | Complete |
| 8 | [Runtime dependency split and lightweight model inference](./phase-08-runtime-dependency-split-and-lightweight-model-inference.md) | In progress |
| 9 | [Docker images and one-command deployment](./phase-09-docker-images-and-one-command-deployment.md) | Complete |
| 10 | [Verification release gates and true-live validation](./phase-10-verification-release-gates-and-true-live-validation.md) | In progress |

## Dependencies

1 → 2 → 3 → 4. Phases 5 and 6 follow phase 4 and may run in parallel. Phase 7 depends on 3–4. Phase 8 depends on 1 and 3. Phase 9 depends on 3, 7, and 8. Phase 10 gates all preceding phases.

## Research

- [Repository and F1 Dash/RL audit](../reports/researcher-260622-2242-f1-dash-pit-wall-rl-audit.md)
- [Dual-workspace runtime research](./research/researcher-260622-2254-dual-workspace-runtime.md)
- [Plan red-team and validation](./reports/reviewer-260622-2254-plan-validation.md)

## Out of scope

- Redis, Kubernetes, accounts, cloud storage, and automatic full-season downloads.
- Selecting or retraining a replacement model before the benchmark is credible.
- Shipping radio audio or recorded live feeds in the repository.

## Unresolved questions

- Private/internal use or public distribution? This determines whether direct F1 Dash UI adoption is acceptable.
- May analysis use a second explicit Compose command?
- What compressed image-size and cold-start budgets should be hard gates?

## Execution notes

- Broadcast workspace now follows the vendored F1 Dash visual language more closely while preserving Pit Wall overlays, workspace switching, and shared state.
- Runtime capabilities now expose fixture/archive/strategy/training more explicitly for honest UI gating.
- Deterministic fixture source is available at `/session/fixture?source=fixture`.
- Docker default boot remains lightweight and does not download archive data on startup.
- RL benchmark cleanup is complete enough to run single-circuit promotion trials; latest `2024 Barcelona` RSRL run did not beat PPO and should remain challenger-only.
