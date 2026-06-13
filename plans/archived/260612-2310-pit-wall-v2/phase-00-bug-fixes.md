---
phase: 0
title: "Bug Fixes"
status: pending
priority: P0
effort: ""
dependencies: []
---

# Phase 00: Bug Fixes

## Overview

Holding phase for bugs discovered during testing. Items will be added here as they are found.
No implementation defined yet — this phase exists so the plan has a dedicated home for fixes.

## Known Issues

### BUG-001: Homepage completely unusable when backend is offline

**File:** `frontend/app/page.tsx`, `frontend/components/home-dashboard.tsx`
**Symptom:** Opening `localhost:3000` shows the hero section but zero sessions or years to pick — user cannot navigate anywhere, no error message, no fallback.
**Root cause:** `page.tsx` calls `api.seasons()` and `api.liveSession()` via `Promise.allSettled`; on failure, passes `seasons=[]` and `liveSession=null` to `HomeDashboard`. The dashboard then renders an empty `<select>` with no options and no indication that the backend is down.
**Fix:**
- When `seasons=[]` + `liveSession=null`, render an explicit "Backend offline" card with retry link
- Add a manual session-key entry form (text input + "Go" button) so users can navigate directly to a known session key (e.g., `monaco_2025_qualifying`) even when `/api/seasons` fails
- Add a connection health dot in the header (green/amber/red)
**Acceptance:** With backend down, home page shows an error card; with it up, normal season list resumes. Manual key entry navigates to `/session/<key>` immediately.

---

### BUG-002: F1 logo is a custom SVG rectangle, not the real chevron mark

**File:** `frontend/components/ui/f1-logo.tsx`
**Symptom:** Logo shows a red rectangle with custom "F" and "1" letterforms instead of the official red chevron/arrow mark.
**Root cause:** `f1-logo.tsx` renders a hand-drawn rectangle SVG; the real F1 logo is the FOM-trademarked red chevron/arrow shape.
**Fix:** Redraw SVG as a faithful vector replica of the official red forward-arrow F1 mark (two parallelogram fins forming the "F1" chevron, `fill="#E10600"`). The SVG must be self-contained (no external image assets).
**Acceptance:** Logo visually matches the official red chevron mark as shown in the user's reference screenshot.

---

### BUG-003: Session page crashes / shows nothing if `ensureSession` throws (no backend)

**File:** `frontend/app/session/[key]/page.tsx`
**Symptom:** Navigating to `/session/<key>` with backend offline throws an unhandled error in the RSC (server component), producing a Next.js error page instead of a meaningful fallback.
**Root cause:** `ensureSession()` is not wrapped in a try/catch; error propagates up to Next.js error boundary without a user-friendly message.
**Fix:** Wrap `ensureSession` + prefetches in try/catch; on error render an inline error card: "Could not load session – backend may be offline" with a back link.
**Acceptance:** Navigating to an invalid or unreachable session shows a styled error card, not a raw Next.js crash page.

## Bug Template

When adding a bug, use this format:

```
### BUG-NNN: <title>

**File:** `path/to/file.tsx:line`
**Symptom:** What the user sees
**Root cause:** Why it happens
**Fix:** What to change
**Acceptance:** How to verify it is fixed
```

## Success Criteria

- [ ] All reported bugs documented above have a root-cause analysis
- [ ] All documented bugs fixed and manually verified

## Notes

- Bugs that require architecture changes should be escalated to a new phase, not fixed here
- Minor visual polish can be included in this phase
