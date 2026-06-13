---
phase: 9
title: "Keyboard Shortcuts + UX Polish"
status: pending
priority: P3
effort: "1.5d"
dependencies: []
---

# Phase 09: Keyboard Shortcuts + UX Polish

## Overview

Power-user keyboard navigation and a collection of small UX improvements identified
during testing. Inspired by RaceControl (Electron) and race-tv-multiplayer.
No new data features — purely interaction quality.

## Requirements

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Play / Pause (archive replay) |
| `→` / `←` | Seek +5s / -5s |
| `+` / `-` or `]` / `[` | Speed up / down (cycle through 0.5× 1× 2× 4× 8×) |
| `F` | Toggle fullscreen |
| `1` / `2` | Switch to Race / Telemetry tab |
| `Escape` | Close any open modal/tooltip |
| `Tab` / `Shift+Tab` | Cycle focus driver in strategy panel + telemetry compare |

### UX Polish Items
- **Hover tooltip on timing tower rows** — show last 3 lap times + interval to car ahead/behind on hover
- **Smooth gap-chart updates** — debounce re-draw to 200ms to reduce flicker
- **Timing tower row flash** — briefly highlight a row when a driver's position changes (green for gain, red for loss)
- **Connection status indicator** — pulsing dot in header; green = connected, amber = reconnecting, red = disconnected
- **Empty state improvements** — better placeholder content for track map before session loads
- **Help legend modal** — `?` key opens a keyboard shortcut reference overlay

### Non-functional
- Global keyboard handler via `useEffect` on `window` (unmount cleanup)
- No new packages — use native browser APIs (`requestFullscreen`, `KeyboardEvent`)
- Shortcuts disabled when focus is inside an `<input>` or `<select>`

## Architecture

```
lib/use-keyboard-shortcuts.ts
  — custom hook: registers keydown handler on window
  — accepts action map: Record<string, () => void>
  — skips if activeElement is input/select/textarea
  — returns nothing; used for side effects only

components/widgets/help-legend-modal.tsx
  — triggered by `?` key
  — full-screen overlay listing shortcuts as a table
  — dismiss with Escape or click-outside
```

Connection indicator:
- Read `connected` from `useRaceStateStore`
- Add pulsing CSS animation when reconnecting (retryMs > 1000 = amber state)
- Add `setReconnecting` to `FeederClient` → store

## Related Code Files

- Create: `frontend/lib/use-keyboard-shortcuts.ts`
- Create: `frontend/components/widgets/help-legend-modal.tsx`
- Modify: `frontend/components/playback-controls.tsx` (keyboard hook integration)
- Modify: `frontend/components/shell/header.tsx` (connection status dot)
- Modify: `frontend/components/timing-tower.tsx` (hover tooltip + position-change flash)
- Modify: `frontend/lib/feeder-client.ts` (expose reconnecting state)
- Modify: `frontend/lib/race-state-store.ts` (add `reconnecting` field)

## Implementation Steps

1. Create `use-keyboard-shortcuts.ts` — generic window keydown hook with input-skip guard
2. Wire playback shortcuts (Space/arrows/+/-) in `PlaybackControls`
3. Wire tab-switch shortcuts (1/2) in `SessionDashboard`
4. Add fullscreen toggle (`F` key) in `AppShell`
5. Add `reconnecting` state to `FeederClient` + store; render pulsing dot in `Header`
6. Add position-change flash to `TimingTower` rows (track previous position per carId)
7. Build `HelpLegendModal`, trigger on `?` key
8. Debounce `GapChart` redraw to 200ms

## Success Criteria

- [ ] All shortcuts in table above functional during archive replay
- [ ] Shortcuts inert when typing in input/select fields
- [ ] Connection dot correctly shows green/amber/red states
- [ ] Timing tower row flashes on position change (≥1 position gained/lost)
- [ ] `?` opens help legend; `Escape` closes it

## Risk Assessment

- `requestFullscreen` not available in iframes or some browsers — catch error, show toast
- Position-change detection needs previous-state comparison; store previous positions in `useRef`
