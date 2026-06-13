---
phase: 10
title: "Live / Replay Mode Switcher + Home Redesign"
status: pending
priority: P0
effort: "2d"
dependencies: [0]
---

# Phase 10: Live / Replay Mode Switcher + Home Redesign

## Overview

Replace the current hard-to-use home page (season dropdown that breaks when backend is offline)
with a clear two-mode entry point: **LIVE** (connect to current session) and **REPLAY** (browse
archive). The source toggle is surfaced prominently on both the home screen and the in-session
header bar.

## Requirements

### Functional
- Home page renders two large cards: "LIVE — Join current session" and "REPLAY — Browse archive"
- LIVE card: enabled/pulsing when `liveSession.session_key != null`; disabled/greyed when no live session is active; shows circuit + session type + year badge
- REPLAY card: opens season browser inline (year selector → event grid → session link); works entirely offline once archive data is cached
- Manual session key entry: a small "Enter session key" text field + arrow-button for power users who know the key directly
- In-session header: prominent **LIVE** / **REPLAY** mode badge that is also a toggle button — clicking LIVE badge redirects to current live session; clicking REPLAY badge allows switching to browse archive without leaving the page
- `source` value (`"live"` | `"archive"`) stored in `useRaceStateStore`; persists during session
- URL encodes mode: `/session/<key>?source=live` or `/session/<key>?source=archive` so refresh preserves state

### Non-functional
- No external state management library beyond existing Zustand stores
- Home page must render a meaningful UI even with zero API calls succeeding (offline-first)
- LIVE badge pulses with a CSS `@keyframes` animation when actually connected + live source

## Architecture

```
app/page.tsx (server)
  └─ HomeDashboard (client)
       ├─ LiveSessionCard   — pulsing badge, LIVE connect button, session info
       ├─ ReplayBrowserCard — year picker → EventGrid (lazy, deferred fetch)
       └─ QuickSessionEntry — <input> + Go → pushes to /session/<key>

app/session/[key]/page.tsx (server)
  └─ SessionDashboard (client)
       └─ AppShell
            └─ Header
                 └─ SourceToggle — "● LIVE" / "⏮ REPLAY" toggle chip
```

State flow:
```
URL param ?source=live|archive
  → page.tsx reads → passes initialSource to SessionDashboard
  → SessionDashboard setSource() on mount
  → Header reads source from store → renders toggle
  → toggle click → setSource() + router.push with new ?source
```

## Related Code Files

- Modify: `frontend/app/page.tsx` — handle backend-offline gracefully; pass `backendOnline` flag
- Modify: `frontend/components/home-dashboard.tsx` — split into LiveSessionCard + ReplayBrowserCard + QuickSessionEntry
- Modify: `frontend/app/session/[key]/page.tsx` — read `?source` query param; wrap ensureSession in try/catch
- Modify: `frontend/components/shell/header.tsx` — render SourceToggle chip
- Modify: `frontend/lib/race-state-store.ts` — add `backendOnline: boolean` field
- Possibly create: `frontend/components/home/live-session-card.tsx`, `frontend/components/home/replay-browser-card.tsx`, `frontend/components/home/quick-session-entry.tsx`

## Implementation Steps

1. Add `backendOnline: boolean` + `setBackendOnline()` to `race-state-store.ts`
2. Rewrite `page.tsx`: call APIs, on failure set `backendOnline=false`, pass both to `HomeDashboard`
3. Build `LiveSessionCard` — pulsing LIVE animation, session meta, "Join →" link; disabled state when no live session
4. Build `ReplayBrowserCard` — year dropdown (populated from `seasons`), on year select lazy-fetch events, render compact event grid; "Backend offline" skeleton if seasons=[]
5. Build `QuickSessionEntry` — plain `<input>` with `placeholder="session key"` + `<button>Go →`; `router.push('/session/' + key)`
6. Wire all three into `HomeDashboard`
7. Read `?source` query param in `app/session/[key]/page.tsx`; wrap entire data fetch block in try/catch and render error card on failure
8. Update `Header` to render a `SourceToggle` chip (green pulse for live, grey rewind icon for archive)

## Success Criteria

- [ ] Home renders correctly with backend offline: shows greyed LIVE card + "Backend offline" message + manual key input still works
- [ ] Home renders correctly with backend online: LIVE card active + year/event grid loads
- [ ] Navigating to `/session/<key>?source=live` shows LIVE badge in header
- [ ] Navigating to `/session/<key>?source=archive` shows REPLAY badge in header
- [ ] Toggle chip in header switches source without page reload
- [ ] Manual key input `monaco_2025_qualifying` → navigates to correct session page
- [ ] Refreshing session page preserves source mode

## Risk Assessment

- `router.push` from server components is not available — all navigation logic must be in client components; `page.tsx` remains a server component that only passes data down
- LIVE animation (pulsing dot) must use CSS only — no JS timers to avoid hydration mismatch
