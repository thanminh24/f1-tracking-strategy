---
phase: 6
title: "Design System & Shell Redesign"
status: pending
priority: P1
effort: "2-3h"
dependencies: []
---

# Phase 6: Design System & Shell Redesign

## Overview

Establish the design system (tokens, palette, typography) and build the persistent application
shell — `AppShell`, `RaceHeader`, `SideNav` — that every dashboard panel lives inside. The
theme is **"Pit Wall"**: carbon-fiber dark, F1 signal red, data-dense monospace panels.

This phase delivers the skeleton layout only; panels (track map, timing tower, etc.) are
redesigned in phase 7-9 inside this shell.

## Requirements

**Functional:**
- Design tokens in `lib/design-tokens.ts`: colors, spacing, typography, team colors palette
- `AppShell` component: full-viewport layout with `RaceHeader` + main content area
- `RaceHeader`: race name, session status, lap counter, source badge (ARCHIVE/LIVE), driver count
- `SideNav` (collapsible): links to Archive, Season, Replay, Settings
- Dark theme only — `globals.css` overhauled; no light-mode toggle
- Responsive: desktop-first (min 1280px); tablet degrades gracefully (panels stack)
- `globals.css` scoped CSS variables for all design tokens

**Non-functional:**
- Zero new JS dependencies for styling (Tailwind v4 already present)
- All team colors sourced from `lib/team-colors.ts` (already exists, just integrate tokens)
- Font: existing Geist Sans/Mono; no new font loads

## Architecture

```
Design Token Hierarchy:
  Primitive  →  Semantic       →  Component
  zinc-950      bg-surface       timing-row-bg
  red-600       accent-primary   live-badge-bg
  amber-400     color-warning    tire-soft-color
  green-500     color-safe       sector-green

Color Palette (CSS vars + Tailwind tokens):
  --f1-red: #E10600          (official F1 signal red)
  --f1-surface: #0f0f0f      (near-black background)
  --f1-panel: #161616        (panel background)
  --f1-border: #2a2a2a       (panel borders)
  --f1-text-primary: #f0f0f0
  --f1-text-muted: #6b6b6b
  --f1-text-accent: #E10600

Team Colors (already in team-colors.ts, formalised as tokens):
  Red Bull:   #3671C6   Mercedes: #27F4D2   Ferrari: #E8002D
  McLaren:    #FF8000   Aston:    #229971   Alpine:  #FF87BC
  Williams:   #64C4FF   Haas:     #B6BABD   Kick:    #52E252
  RB:         #6692FF

App Shell Layout:
  ┌─ RaceHeader (48px fixed) ────────────────────────────────┐
  │  [≡] F1 · Bahrain GP 2024 · Race  Lap 32/57  ● LIVE  🟢  │
  ├─ SideNav (56px collapsed / 200px expanded) ──────────────┤
  │  main content (flex 1, overflow hidden)                  │
  └──────────────────────────────────────────────────────────┘
```

**Typography scale:**
- Display: `font-mono text-xs` for timing data (Geist Mono)
- Label: `font-sans text-[10px] uppercase tracking-wider text-f1-text-muted`
- Value: `font-mono text-sm font-bold`
- Panel title: `font-sans text-xs uppercase tracking-widest`

## Related Code Files

- Create: `frontend/lib/design-tokens.ts` — token constants + Tailwind CSS var references
- Modify: `frontend/app/globals.css` — full overhaul with CSS vars + Tailwind theme extension
- Create: `frontend/components/layout/app-shell.tsx`
- Create: `frontend/components/layout/race-header.tsx`
- Create: `frontend/components/layout/side-nav.tsx`
- Create: `frontend/components/layout/panel.tsx` — reusable bordered panel wrapper
- Modify: `frontend/app/layout.tsx` — wrap root with `AppShell`
- Modify: `frontend/app/session/[key]/page.tsx` — use `AppShell` + `RaceHeader`
- Modify: `frontend/lib/team-colors.ts` — export team colors as design tokens

## Implementation Steps

1. **Overhaul `globals.css`** — replace existing 26-line file:
   ```css
   @import "tailwindcss";
   :root {
     --f1-red: #E10600;
     --f1-surface: #0f0f0f;
     --f1-panel: #161616;
     --f1-border: #2a2a2a;
     --f1-text-primary: #f0f0f0;
     --f1-text-muted: #6b6b6b;
   }
   @theme inline {
     --color-f1-red: var(--f1-red);
     --color-f1-surface: var(--f1-surface);
     --color-f1-panel: var(--f1-panel);
     --color-f1-border: var(--f1-border);
   }
   body { background: var(--f1-surface); color: var(--f1-text-primary); }
   ```
2. **Create `lib/design-tokens.ts`** — export `TOKENS` object mirroring CSS vars for JS use
3. **Create `components/layout/panel.tsx`** — reusable bordered panel:
   ```tsx
   // border border-f1-border bg-f1-panel rounded-lg overflow-hidden
   // optional props: title, className, noPad
   ```
4. **Create `components/layout/race-header.tsx`** — fixed 48px top bar:
   - Left: hamburger + "F1 Strategy" wordmark
   - Center: `{event_name} · {session_type}` | `Lap {n}/{total}`
   - Right: source badge (`ARCHIVE` zinc / `● LIVE` red), session status dot
5. **Create `components/layout/app-shell.tsx`** — flex column: header (48px) + body (flex-1)
6. **Create `components/layout/side-nav.tsx`** — icon-only nav bar (56px) with tooltip labels;
   links: Archive (grid icon), Replay (play icon), Telemetry (chart icon), Settings (gear icon)
7. **Wire into `app/layout.tsx`** — wrap `{children}` with `AppShell`
8. **Update existing pages** to use `Panel` wrapper instead of bare `border border-zinc-800`
9. **Visual check** — `make dev`, open browser, verify header + nav render; no layout overflow

## Success Criteria

- [ ] All CSS design tokens defined in `globals.css` and mirrored in `design-tokens.ts`
- [ ] `AppShell` renders on every page (archive browser, season page, replay page)
- [ ] `RaceHeader` shows race name, lap, and source badge
- [ ] `SideNav` collapses to icon-only, expands on hover/click
- [ ] `Panel` component used consistently across all 3 page types
- [ ] `make dev` shows dark shell at localhost:3000 with no layout shift
- [ ] No light-mode flash (body background is `#0f0f0f` unconditionally)
- [ ] TypeScript compiles clean (`npm run build` no errors)

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Tailwind v4 `@theme inline` syntax breaking existing styles | Read current globals.css carefully; keep existing `--font-sans`/`--font-mono` vars |
| Panel wrapper breaks existing component sizing | Use `className` passthrough; don't force fixed heights |
| SideNav overlaps map canvas at narrow widths | Collapse to zero-width below 1024px; icon-only below 1280px |
