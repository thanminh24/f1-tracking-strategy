# Adversarial Code Review — Pit Wall v2 Frontend
**Date:** 2026-06-13  
**Scope:** Shell, Home, Session Dashboard, Track Map, Telemetry, Strategy, Stats  
**Reviewer:** code-reviewer agent (adversarial pass)

---

## Overall Assessment

The refactor is well-structured and the new component hierarchy is clean. However, three CRASH-class bugs will prevent the archive browser from ever opening a session, silently corrupt all canvas rendering at non-1x DPI, and cause every keyboard shortcut to re-register on every render. Several BUG-class issues also cause data loss (live poll result discarded), stale UI state, and broken source switching. These are not edge-case failures — they will trigger on the first user interaction.

---

## CRASH — Blocking

### C1 · `components/home/archive-browser.tsx:41` — CRASH
**Session key built with positional index instead of session type code; all archive links 404.**

`const key = \`${year}_${event.round}_${idx + 1}\`` builds e.g. `2024_1_1`.  
Backend's `parse_session_key` expects `{year}_{round}_{session_code}` (e.g. `2024_1_FP1`, `2024_1_R`).  
The DB stores short codes `FP1 | FP2 | FP3 | Q | SQ | SS | S | R` (see `ingestion/pipeline.py:32-40`).  
Every "SessionPill" link navigates to a key the backend cannot resolve → 404 + `ensure_session` ValueError.

**Fix:**
```tsx
// Replace idx-based key with session_type string from the array
event.session_types.map((type) => {
  const key = `${year}_${event.round}_${type}`;
  return <SessionPill key={type} href={`/session/${key}`} label={type} />;
})
```

---

### C2 · `components/track-map.tsx:196-200` — CRASH (visual corruption at HiDPI)
**`ctx.scale(dpr, dpr)` accumulates across resize events, corrupting the canvas transform matrix.**

`updateCanvasSize()` sets `canvas.width = rect.width * dpr` (which resets the canvas state machine to identity), then calls `ctx.scale(dpr, dpr)`.  
However the *draw effect* (line 233) passes a fake `tempCanvas` with logical dimensions but draws into the *already-DPI-scaled* ctx:
```ts
const tempCanvas = { width: logicalWidth, height: logicalHeight };
drawFrame(ctx, tempCanvas as any, geo, state, ...);
```
`drawFrame` scales to `Math.min(width, height) / 1000` using the *logical* dimensions, but the ctx has already been scaled by `dpr`. This means `ctx.scale(dpr, dpr)` in the resize effect is never cancelled before drawing — on 2x displays all coordinates are doubled, making the track render in the top-left quarter of the canvas.

**Fix:** Either (a) don't call `ctx.scale` in resize — instead divide by `dpr` in `drawFrame`'s `toCanvas`, or (b) call `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` before drawing to reset + reapply, not accumulate.

Simplest fix — remove `ctx.scale` from resize and let `drawFrame` work in physical pixels:
```ts
// In updateCanvasSize — remove:
// if (ctx) ctx.scale(dpr, dpr);
// In draw effect, pass physical canvas directly:
drawFrame(ctx, canvas, geo, state, focusedCarId, circuit, showDrs);
```
Then in `drawFrame` the `Math.min(width, height) / 1000` already operates in physical pixels, which is correct.

---

### C3 · `lib/use-keyboard-shortcuts.ts:22` — CRASH (infinite re-registration loop)
**`shortcuts` object is a new reference every render; the `useEffect` dep fires on every render, repeatedly adding/removing the global keydown listener.**

`PlaybackControls` passes a new object literal on every render:
```ts
useKeyboardShortcuts(source === "archive" && status && connected ? { " ": () => ..., ... } : {});
```
`useEffect([shortcuts])` sees a new reference every render → removes old listener → adds new one → triggers re-render (store subscription) → repeat.

`SessionDashboard` has the same pattern.

**Fix in `use-keyboard-shortcuts.ts`:** Stabilize the dep by comparing key sets, or accept a stable ref:
```ts
const shortcutsRef = useRef(shortcuts);
useLayoutEffect(() => { shortcutsRef.current = shortcuts; });
useEffect(() => {
  const handler = (e: KeyboardEvent) => { ... shortcutsRef.current[e.key]?.(); };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []); // stable — never re-registers
```

---

## BUG — High Priority

### B1 · `components/shell/header.tsx:23` — BUG
**`router.push(url.toString())` pushes an absolute URL; Next.js App Router `push()` expects a relative path.**

`new URL(window.location.href)` → `url.toString()` produces `http://localhost:3000/session/foo?source=live`.  
`next/navigation` router rejects absolute URLs in production builds — it either navigates externally or throws.

**Fix:**
```ts
const handleSourceToggle = (newSource: "live" | "archive") => {
  const params = new URLSearchParams(window.location.search);
  params.set("source", newSource);
  router.push(`${window.location.pathname}?${params.toString()}`);
};
```

---

### B2 · `components/shell/header.tsx` + `app/session/[key]/session-dashboard.tsx` — BUG
**Source toggle changes the URL but never calls `feeder.setSource()` — the WebSocket data source doesn't switch.**

`Header.handleSourceToggle` only updates the URL query param. The `SessionDashboard` effect reads `initialSource` (from SSR) and calls `setSource(initialSource)` once — but route navigation with the same `[key]` segment won't remount the page in the App Router (it's a soft navigation). The `FeederClient.setSource()` method exists and would POST to `/api/sessions/{key}/source`, but it's never invoked from the UI.

**Fix:** The header needs to call the feeder client. Expose a callback from `SessionDashboard` through context or prop, or make `Header` source-toggle call `clientRef.current?.setSource(newSource)` directly via a context provider before also calling `router.push`.

---

### B3 · `components/telemetry/telemetry-view.tsx:77-88` — BUG
**Live poll fetches laps but discards the result; lap data displayed in telemetry tab never updates during a live session.**

```ts
const poll = async () => {
  try {
    await api.laps(sessionKey); // result is discarded — no setState
  } catch (err) { ... }
};
```
`laps` is a prop, not local state. The live poll fetches new laps but nowhere stores or propagates them.

**Fix:** Either lift `laps` to local state initialized from the prop, or remove the dead poll and rely on a parent-level refresh mechanism.

---

### B4 · `lib/use-telemetry-fetch.ts:46` — BUG
**`samplesMap` is returned as the raw `Map` reference from `samplesCacheRef.current`; `MultiLapTracesChart` receives the same object identity after new samples load.**

`setSamplesVersion` triggers a re-render of `TelemetryView`, which then passes `samplesCacheRef.current` (same Map reference) to `MultiLapTracesChart`. If `MultiLapTracesChart` uses `React.memo` or even just relies on prop identity for bailout, it will not re-render with the new data. Charts show stale (empty) state until another prop changes.

**Fix:** Return a snapshot so the reference changes:
```ts
return {
  samplesMap: samplesCacheRef.current, // keep for now
  // Add a version counter as a separate prop to force chart re-render
};
```
Or spread into a new Map: `samplesMap: new Map(samplesCacheRef.current)` (copy on version bump).

---

### B5 · `components/strategy/head-to-head-card.tsx:25` — BUG
**`useEffect` depends on `sorted.length` (a primitive) but reads `sorted[0]` and `sorted[1]` via stale closure; if `sorted` changes while `.length` stays the same, the initialization never re-runs with new drivers.**

```ts
useEffect(() => {
  if (sorted.length >= 2 && !carAId) {
    setCarAId(sorted[0].car_id); // sorted is stale if length unchanged
    setCarBId(sorted[1].car_id);
  }
}, [sorted.length]); // wrong dep
```
React lint rule `react-hooks/exhaustive-deps` would flag this.

**Fix:**
```ts
}, [sorted.length, sorted[0]?.car_id, sorted[1]?.car_id]);
```

---

### B6 · `components/telemetry/sector-heatmap.tsx:54-56` — BUG
**`selectedDriver` state initializes from `driversWithSectors` computed during render, but `useState` initializer runs only once; if `laps` prop arrives empty then populates (async), the selector is stuck on `null`.**

```ts
const [selectedDriver, setSelectedDriver] = useState<string | null>(
  driversWithSectors.length > 0 ? driversWithSectors[0].car_id : null // only runs once
);
```
When `laps=[]` on first render (common on slow connections), `selectedDriver` is `null`. When laps arrive via prop update, `driversWithSectors` updates but `selectedDriver` stays `null`, showing "No sector data available for this driver" indefinitely.

**Fix:** Add an effect to initialize when `driversWithSectors` first becomes non-empty:
```ts
useEffect(() => {
  if (!selectedDriver && driversWithSectors.length > 0) {
    setSelectedDriver(driversWithSectors[0].car_id);
  }
}, [driversWithSectors, selectedDriver]);
```

---

### B7 · `components/track-map.tsx:144` — BUG
**SC active detection checks only the most-recent race control message, not the race state; once a non-SC message arrives, the SC overlay incorrectly disappears.**

```ts
const scActive = raceControlMessages.length > 0 && raceControlMessages[0].category === "SafetyCar";
```
`addRaceControlMessage` prepends new messages, so `[0]` is the latest. If a "Flag" message arrives during SC period, `scActive` becomes false even though SC is still deployed. The correct signal is `state.track_status === "sc"` or `"vsc"`.

**Fix:**
```ts
const scActive = state?.track_status === "sc" || state?.track_status === "vsc";
```

---

### B8 · `app/session/[key]/session-dashboard.tsx:99` — BUG
**`clientRef.current` is passed to `RaceView` at render time but the ref is populated in `useEffect` (after render); on first render `client` is always `null`, so `PlaybackControls` renders in a disconnected state and keyboard shortcuts don't register.**

```ts
// render: clientRef.current is null here on mount
<RaceView sessionKey={sessionKey} client={clientRef.current} laps={laps} />
```
This is a React anti-pattern: passing a ref's value as a prop captures null. `PlaybackControls` gets `client=null`, disables all controls, and never re-renders when `clientRef.current` is set because ref mutation doesn't trigger re-render.

**Fix:** Use state for the client, or a forwardRef/context pattern:
```ts
const [client, setClient] = useState<FeederClient | null>(null);
// in useEffect:
const c = new FeederClient(sessionKey);
c.connect();
setClient(c); // triggers re-render with real client
```

---

## WARN — Medium Priority

### W1 · `components/home/archive-browser.tsx:64` — WARN
**Missing exhaustive deps: `initialYear` and `initialEvents` referenced inside `useEffect` but absent from dependency array.**

The guard `year === initialYear && initialEvents.length > 0` silently captures stale prop values. The ESLint `react-hooks/exhaustive-deps` rule would flag this.

**Fix:** Add them to deps, or extract the guard into a ref:
```ts
}, [year, initialYear, initialEvents.length]);
```

---

### W2 · `components/home/archive-browser.tsx:42` — WARN
**`key={type}` on `<SessionPill>` is not stable if the same session type appears in two events (duplicate keys within same render list).**

`event.session_types` from the same event won't have duplicates, but this is safe only because the backend enforces uniqueness per round. It's fragile; a defensive key would be `key={`${event.round}-${type}`}`.

---

### W3 · `lib/use-telemetry-fetch.ts:23` — WARN
**Telemetry key format `"${carId}-${lap}"` breaks if `car_id` contains a dash (e.g. `"car-33"`).**

```ts
const [carId, lapStr] = key.split("-"); // "car-33-5" → carId="car", lap="33"
```
The backend `car_id` is declared as `string` with no constraint; real OpenF1 car numbers are numeric strings like `"1"`, `"33"`, but the format is not enforced. If an ID like `"car-33"` ever appears, the parsed `carId` and `lap` are wrong, causing silent telemetry fetch failures.

**Fix:** Use a non-ambiguous separator:
```ts
const sep = key.lastIndexOf("-");
const carId = key.slice(0, sep);
const lap = Number(key.slice(sep + 1));
```

---

### W4 · `components/home-dashboard.tsx:76` — WARN
**`isOffline` condition requires all three signals to indicate failure; if the backend is online but returns empty seasons and no live session (valid new installation), the user sees empty tab content rather than a useful onboarding message.**

```ts
const isOffline = !backendOnline && seasons.length === 0 && !liveAvailable;
```
When `backendOnline=true` but `seasons=[]` and `liveAvailable=false`, the archive tab shows nothing and the live tab shows "No live session active". The `BackendOfflineCard` with its manual session entry form is hidden.

---

### W5 · `components/home/live-session-card.tsx` + `components/home/replay-browser-card.tsx` + `components/home/quick-session-entry.tsx` — WARN
**Three components are defined but never imported or used anywhere in the codebase.**

All three files exist under `components/home/` but are not imported by `home-dashboard.tsx`, `page.tsx`, or any other file. They are dead code from the previous design iteration.

---

### W6 · `app/session/[key]/session-dashboard.tsx:112-117` — WARN
**`extractCircuitFromKey` is defined but only used in one place; also, `parts.length === 0` is always false (`.split()` returns at least one element).**

```ts
function extractCircuitFromKey(sessionKey: string): string | undefined {
  const parts = sessionKey.split("_");
  if (parts.length === 0) return undefined; // unreachable
```
Minor dead branch, but the function is correct otherwise. Low risk.

---

### W7 · `components/stats/stats-tab.tsx:34-45` — WARN
**`useMemo` on `content` with `activeSubTab` as dep will recompute the component tree (including creating new React elements) on every tab switch, defeating the purpose of "lazy loading"; `activatedTabs` is checked but `content` is always recomputed when `activeSubTab` changes.**

The lazy-load intent (`activatedTabs`) is undercut because `content` is re-derived from `useMemo` on every tab switch. The correct pattern is to render all tabs and hide via CSS (`display: none`), or use `Suspense` with lazy imports.

---

### W8 · `components/track-map.tsx:270` — WARN
**`normalizeDrsCircuit(circuit)` is called twice per render** — once for the DRS overlay (line 81) and once for the button (line 270). Idempotent but wasteful; should be memoized.

---

## INFO — Low Priority

### I1 · `components/home/archive-browser.tsx:50-51` — INFO
**`latestYear` is computed from `seasons` prop on every render; `initialYear ?? latestYear` means if `initialYear` is `null` and seasons is empty, `year` state is `null`. The component correctly handles this case, but it could be simplified.**

### I2 · `components/telemetry/position-bump-chart.tsx:54` — INFO
**`lapTicks` for sessions with fewer than 10 laps (practice, sprint) produces an empty array — the X axis has no labels. Not a crash, just poor UX for short sessions.**

### I3 · `components/strategy/head-to-head-card.tsx:44-46` — INFO
**Using `<details open={isOpen}>` with `onToggle` creates a dual source of truth (React state vs native element state). Keyboard activation of `<summary>` toggles the native element, which fires `onToggle` and syncs — so it mostly works, but `details` with controlled `open` prop and content conditionally rendered on `isOpen` creates a flash: the native element opens (empty) before React re-renders with content.**

Fix: either always render content (hidden via CSS) or use a fully controlled pattern without `<details>`.

### I4 · `components/home/backend-offline-card.tsx:12` — INFO
**No input sanitization on `sessionKey` before `router.push`. A user could navigate to `/session/../admin` if the backend doesn't block path traversal. Next.js normalizes `..` in route params so the actual risk is low in production, but the backend `ensure_session` route would receive a path-traversal attempt.**

### I5 · `app/page.tsx:15` — INFO
**`backendOnline` is `true` if either `seasons` or `liveSession` succeeds. If `seasons` fails but `liveSession` succeeds, `seasonData = []` but `backendOnline = true`, so the archive tab renders with no seasons and no useful content. Acceptable degradation, but worth a comment.**

---

## Dead Code

| File | Status |
|------|--------|
| `components/home/live-session-card.tsx` | Never imported — dead |
| `components/home/replay-browser-card.tsx` | Never imported — dead |
| `components/home/quick-session-entry.tsx` | Never imported — dead |
| `session-dashboard.tsx:112` `extractCircuitFromKey` | Used once; `parts.length === 0` branch unreachable |
| `track-map.tsx:107` `const haloRadius = isFocused ? 9 * scale : 9 * scale` | Both branches identical — dead ternary |

---

## UX Regressions vs Previous Design

| Feature | Previous | Current | Status |
|---------|----------|---------|--------|
| Source toggle (live ↔ archive) | Wired to feeder client | URL-only; feeder not notified | **BROKEN** (B2) |
| Playback controls on mount | Connected client available | `client=null` on first render | **BROKEN** (B8) |
| Live lap refresh in telemetry | N/A | Poll result discarded | **BROKEN** (B3) |
| SC overlay accuracy | N/A | Based on last message not track_status | **DEGRADED** (B7) |
| Archive session links | N/A (new feature) | All generate wrong key format | **BROKEN** (C1) |

---

## Prioritized Fix List

| Priority | Finding | File | Impact |
|----------|---------|------|--------|
| 1 | **C1** — Wrong session key format in archive links | `archive-browser.tsx:41` | All archive sessions 404 |
| 2 | **C3** — Keyboard shortcut listener re-registered every render | `use-keyboard-shortcuts.ts:22` | Input handler storm |
| 3 | **C2** — Canvas DPI scale applied but draw uses logical coords | `track-map.tsx:196-233` | Track map garbled at 2x |
| 4 | **B8** — `clientRef.current` passed as prop is null on mount | `session-dashboard.tsx:99` | Controls never connect |
| 5 | **B2** — Source toggle doesn't call `feeder.setSource()` | `header.tsx:21`, `session-dashboard.tsx` | Live/archive switch broken |
| 6 | **B1** — `router.push` with absolute URL | `header.tsx:23` | Navigation fails in prod |
| 7 | **B3** — Live poll discards fetched laps | `telemetry-view.tsx:79` | Live telemetry never updates |
| 8 | **B4** — `samplesMap` same reference, chart may not re-render | `use-telemetry-fetch.ts:46` | Charts show stale data |
| 9 | **B7** — SC detection uses message not track_status | `track-map.tsx:144` | SC overlay wrong after next msg |
| 10 | **B5** — Stale closure in H2H driver initialization | `head-to-head-card.tsx:25` | Wrong drivers shown |
| 11 | **B6** — Sector heatmap driver not initialized on late laps | `sector-heatmap.tsx:54` | Heatmap stays blank |
| 12 | **W1** — Missing useEffect deps in ArchiveBrowser | `archive-browser.tsx:64` | Stale guard after prop change |
| 13 | **W3** — Telemetry key breaks for car IDs with dashes | `use-telemetry-fetch.ts:23` | Silent data fetch failure |
| 14 | **W5** — Three dead components | `home/live-session-card.tsx` etc. | Dead code |

---

## Positive Observations

- Session page correctly `await`s `params` and `searchParams` as `Promise<{...}>` per Next.js 15 App Router contract.
- `useTrackGeo` module-level cache with in-flight dedup is a correct pattern that survives tab switches.
- `FeederClient.close()` resets both stores — no state leak on navigation.
- `HomeDashboard` uses `Promise.allSettled` so one backend failure doesn't block the page.
- `SectorHeatmap` correctly handles `Infinity` for "no data" comparisons.
- Canvas click-to-select driver correctly adjusts hit radius in logical coords.

---

## Unresolved Questions

1. **C2 ambiguity:** The intended DPI strategy is unclear — should `drawFrame` operate in logical or physical pixels? The current hybrid (resize scales ctx, draw uses logical dimensions via `tempCanvas`) is broken. Decide once and document.
2. **Source toggle design:** Should switching live ↔ archive cause a full page reload (cleanest) or a soft feeder reconnect (more complex)? The `FeederClient.setSource()` path exists but is never tested through the UI.
3. **Live lap refresh owner:** Should live lap polling live in the session page (SSR re-fetch) or in `TelemetryView` (client-side)? Currently it's in `TelemetryView` but the result is discarded — needs a design decision on state ownership.
