---
phase: 14
title: "Track Map Visual Quality + Real F1 Logo"
status: pending
priority: P1
effort: "1.5d"
dependencies: [10]
---

# Phase 14: Track Map Visual Quality + Real F1 Logo

## Overview

Two focused visual-quality improvements: (1) replace the placeholder F1 logo SVG with a
faithful replica of the official red chevron mark, and (2) upgrade the Canvas2D track map
to render crisp, high-contrast track outlines with DPI-aware scaling, driver dots with
team-colored halos, and a safety car animated overlay.

## Requirements

### Real F1 Logo

The official F1 logo is a red forward-arrow / chevron mark made of two parallelogram
shapes that together read as "F1". The SVG must:
- Be a self-contained `<svg>` component (no external images, no img src)
- Use only `fill="#E10600"` (F1 red) — no gradients, no stroke
- Scale correctly via `className` prop (`h-8 w-auto`, `h-10 w-auto`, etc.)
- Match the proportions of the official mark: the left fin (F) and right fin (1) as
  forward-leaning parallelograms with the negative space between them

Reference geometry (approximate, based on official mark proportions):
```
viewBox="0 0 60 26"
Left fin (F):  parallelogram slanted ~15° forward, occupying left ~40% of width
Right fin (1): narrower parallelogram, occupying right ~30%, separated by gap ~15%
```

### Track Map Visual Quality

Current issues:
- Track outline is thin (1px) and aliased on high-DPI displays
- Driver dot size is small and hard to distinguish at a glance
- No team-color halo around dots — all dots look identical except for label
- Status-based outline coloring is too subtle
- Track geo fetch is not preloaded (visible pop-in during initial render)

Fixes:
1. **DPI-aware canvas**: set `canvas.width = containerWidth * devicePixelRatio`; scale ctx by `devicePixelRatio` before drawing
2. **Thicker track outline**: `lineWidth = 3 * dpr` for the outline; double-pass rendering (dark shadow + bright line on top)
3. **Driver dots**: increase radius from 4px to 7px; add team-color halo (outer ring 2px wider, 50% opacity)
4. **Status coloring**: `LIVE` = green outline + animated glow; `SC` / `VSC` = yellow outline; `REPLAY` = grey; use `f1-red` as accent for fastest-sector markers
5. **Geo preloading**: add `<link rel="prefetch">` for `/api/sessions/<key>/track-outline` in the session page `<head>` so the geo is in browser cache when the component mounts
6. **Focused driver highlight**: when `focusedCarId` is set (phase-11), draw that driver's dot 2x larger with a white ring

### Safety Car Overlay

When `raceControlMessages` contain an active SC/VSC:
- Draw a pulsing yellow/orange ring around the track outline (10px wider than outline, 30% opacity, CSS `@keyframes` pulsing via an overlay `<div>` behind the canvas)
- A "SC" badge in the top-right corner of the map panel

### Non-functional
- Canvas resize observer: recalculate DPI scale on container resize (current code may be static)
- Track geo is cached in module-level Maps (`pointsCache`, `geoCache`) — do not break this pattern
- Driver label font: use `12px "JetBrains Mono", monospace` for 3-char labels (matches F1 timing displays)

## Architecture

### F1 Logo SVG

```tsx
// components/ui/f1-logo.tsx
export function F1Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 26" className={className} aria-label="Formula 1">
      {/* Left fin — F shape parallelogram */}
      <polygon points="..." fill="#E10600" />
      {/* Right fin — 1 shape parallelogram */}
      <polygon points="..." fill="#E10600" />
    </svg>
  );
}
```

Exact polygon points to be calculated from official mark proportions. Use a 60×26 viewBox
with fins at approximately:
- Left fin: `5,0 35,0 30,26 0,26` trimmed by the negative F-space
- Right fin: `38,0 55,0 50,26 33,26`
(Adjust during implementation to match visual reference.)

### Track Map Canvas Upgrade

```
useTrackGeo.ts  — unchanged (module cache stays)
use-canvas-loop.ts  — unchanged
track-map.tsx:
  mount:
    - ResizeObserver on container div → update canvas size + dpr scale
    - prefetch geo if not cached
  drawFrame(ctx, geo, cars, focusedCarId, scActive):
    1. Clear
    2. Double-pass outline: shadowBlur pass + bright pass
    3. Draw driver dots: outer halo (teamColor, 50% alpha) + inner dot (teamColor)
    4. Draw focused driver: white ring + larger radius
    5. Draw 3-char labels: JetBrains Mono 12px
    6. If scActive: draw pulsing overlay ring (handled by CSS div, not canvas)
```

## Related Code Files

- Modify: `frontend/components/ui/f1-logo.tsx` — replace SVG content with real chevron
- Modify: `frontend/components/track-map.tsx` — DPI scaling, thicker outline, halo dots, focused driver, SC overlay badge
- Modify: `frontend/app/session/[key]/page.tsx` — add `<link rel="prefetch">` for track-outline
- Modify: `frontend/lib/race-state-store.ts` — expose `focusedCarId` (added in phase-11); read `raceControlMessages` for SC status
- No new files needed

## Implementation Steps

1. Design F1 logo SVG geometry: sketch 60×26 viewBox with two parallelogram fins; adjust polygon points until proportions match official mark; update `f1-logo.tsx`
2. Add `ResizeObserver` to `track-map.tsx`; compute `dpr = window.devicePixelRatio`; set canvas physical size = logical size × dpr; call `ctx.scale(dpr, dpr)`
3. Update `drawTrack()`: double-pass (shadow + bright line at `lineWidth = 3`); status-based colors
4. Update `drawDrivers()`: outer halo ring + inner dot; focused driver larger + white ring
5. Add SC/VSC overlay: read `raceControlMessages` for active SC; render pulsing CSS div + "SC" badge
6. Add `<link rel="prefetch">` for track-outline URL in `app/session/[key]/page.tsx`
7. Update driver label font to `JetBrains Mono 12px`

## Success Criteria

- [ ] F1 logo in header visually matches the official red chevron mark (user review)
- [ ] Track map is sharp on a 2x DPI display (no aliased/blurry outline)
- [ ] Driver dots have visible team-color halos; focused driver is clearly larger
- [ ] Track outline is at least 3px wide and clearly visible against dark background
- [ ] SC pulsing overlay appears when an active SC race control message is present
- [ ] Track geo loads without pop-in pop (prefetch effective on second visit or fast connection)

## Risk Assessment

- F1 logo exact polygon coordinates require manual iteration to match proportions — budget 30min for visual fine-tuning
- `devicePixelRatio` is not available in SSR; guard with `typeof window !== "undefined"` check (canvas only renders client-side so this should already be fine)
- Prefetch link in RSC `<head>` requires `API_BASE` to be known at render time; since it's same-origin it can be a relative path `/api/sessions/<key>/track-outline`
