---
phase: 2
title: "Licensing and adoption boundary"
status: complete
effort: "0.5 day"
---

# Phase 2: Licensing and adoption boundary

## Overview

Resolve whether we can directly adopt and modify the F1 Dash UI, and document the fallback clean-room path if that adoption is not acceptable.

## Implementation Steps

1. Inventory the exact F1 Dash UI code, CSS, icons, fonts, screenshots, and assets we would import versus re-skin or replace.
2. Decide whether the target is internal/private use, AGPL-compliant distribution, or a later public rewrite.
3. If direct adoption is allowed, document required notices, source-offer obligations, local modifications policy, and prohibited trademark/logo usage.
4. If direct adoption is not allowed, lock the fallback clean-room boundary before phase 5 starts.
5. Review Formula 1/team marks, OpenF1 recording URLs, MultiViewer circuit data, and redistribution/caching terms.
6. Add attribution/NOTICE and a root license if distribution requires it.
7. Gate phase 5, demo publishing, and container image publication on this decision.

## Success Criteria

- [ ] Decision states whether direct F1 Dash UI adoption is allowed, and under what conditions.
- [ ] Allowed imported code/assets and prohibited branding are explicitly listed.
- [ ] Provider attribution/cache rules are documented.
- [ ] Public distribution cannot proceed with unresolved root licensing.
