---
phase: 9
title: "Docker images and one-command deployment"
status: complete
effort: "2 days"
---

# Phase 9: Docker images and one-command deployment

## Overview

Deliver reproducible, non-root, health-checked images and one simple default command, while keeping any adopted F1 Dash UI assets/code packaged only under the licensing decision from phase 2.

## Implementation Steps

1. Add multi-stage backend image targets for live and analysis; install locked production groups and copy only runtime material.
2. Add a multi-stage frontend image using existing Next standalone output; explicitly include public/static runtime assets.
3. Add ignore rules excluding VCS, dependency caches, virtual environments, plans/tests where safe, and local data caches.
4. Make `docker compose up` start web plus live API with no race download; document a separate analysis override using the same ports and named volume.
5. Run non-root with init, healthchecks, graceful stop, bounded logs, environment validation, and read-only/tmpfs where compatible.
6. Verify amd64/arm64 support, emit SBOM/security scan, and record compressed size/startup.
7. Test clean checkout, offline second boot, restart, unhealthy dependency, empty volume, and persistence.

## Success Criteria

- [ ] Default command reaches healthy UI/API without historical download.
- [ ] Images contain no local 1.9 GiB cache, secrets, or development dependencies.
- [ ] Static assets and WebSockets work through Compose networking.
- [ ] Size/startup budgets and supported architectures are measured.
