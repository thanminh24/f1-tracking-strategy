# F1 Live Timing Alternatives Research Report

**Objective:** Find viable replacements for OpenF1 REST API (restricted during live sessions without paid key).

---

## 1. **FastF1 Live Timing** ⚠️ POST-SESSION ONLY

**GitHub:** https://github.com/theOehrly/Fast-F1

**Availability:** NOT suitable for live sessions. Library connects via SignalR but **explicitly cannot process data during active sessions**. Designed as a recording tool only—raw data stored to disk, processed after session concludes via `Session.load()`.

**Data Fields:** Positions, lap times, tires, pit stops, weather, race control messages, telemetry (via 21 SignalR topics).

**Update Frequency:** Real-time during capture (~100ms), post-processing only for analysis.

**Python Integration:** Native asyncio client. Trivial complexity—wraps SignalR protocol.

**Auth:** None required.

**Status:** Active (v3.8.3, 2026 updates included).

**Verdict:** Recording-only. Unsuitable for live strategy overlay.

---

## 2. **F1 Official SignalR (livetiming.formula1.com)** ✅ LIVE-CAPABLE

**Endpoints:**
- Negotiation: `https://livetiming.formula1.com/signalr/negotiate`
- WebSocket: `wss://livetiming.formula1.com/signalrcore` (or legacy `/signalr/connect`)

**Availability:** Public. No API key required. Powers official F1 timing screens during live sessions.

**Data Fields:** All 21 topics—positions, lap times, tires, pit stops, weather, SC flags, radio messages, telemetry (compressed DEFLATE streams).

**Update Frequency:** Real-time batch windows (~50ms).

**Python Integration:** Moderate complexity. Two-step handshake (negotiate → WebSocket). Requires: auth headers (case-sensitive), ConnectionToken extraction, cookie handling. Raw JSON over WebSocket; no official client.

**Auth:** Two-step negotiation returns token + cookie. No persistent API key needed.

**Caveat:** Undocumented endpoint. Community reverse-engineered. F1 could throttle/block scraping clients.

**Verdict:** Most direct, real-time access. Requires custom Python async WebSocket client; moderate risk of endpoint changes.

---

## 3. **LiveF1 Python Package** ✅ LIVE-CAPABLE (RECOMMENDED)

**PyPI:** https://pypi.org/project/livef1/

**What it is:** Unified Python toolkit combining F1 Livetiming (SignalR) + Jolpica F1 API (historical/calendar data). Active 2026 development.

**Availability:** Live sessions via `RealF1Client` adapter. Subscribes to SignalR topics with callback-based event handling.

**Data Fields:** Positions, telemetry, lap times, tires, weather, pit strategy, race control messages.

**Update Frequency:** Real-time (SignalR stream).

**Python Integration:** Highest-level abstraction. Drop-in callbacks for live events. Async native.

**Auth:** Inherited from F1 SignalR (no additional key).

**License:** Open source.

**Active Maintenance:** Yes (v1.2.0 released May 2026).

**Verdict:** Best option for live sessions. Abstracts SignalR complexity. Maintained actively. **Recommended for immediate adoption.**

---

## 4. **multiviewer-for-f1** ⚠️ NO DIRECT API

**GitHub:** https://github.com/f1multiviewer

**What it is:** Desktop motorsport client (F1 TV playback + timing UI).

**Local API exposure:** Limited. MCP server integration available (for AI agents), but **no exposed REST/WebSocket API for polling data**. Designed as a standalone viewer, not a data source.

**Verdict:** Not viable as timing data source.

---

## 5. **Jolpica-F1 API** ✅ HISTORICAL ONLY

**GitHub:** https://github.com/jolpica/jolpica-f1

**What it is:** Ergast-compatible REST API (no live data). Provides seasons, drivers, constructors, results, standings.

**Availability:** Historical data only (no live sessions).

**Live Capability:** None.

**Verdict:** Supplement only. Use for calendar/driver metadata, not live timing.

---

## 6. **Ergast API** ❌ DEAD (SINCE 2024)

Status: Shut down end of 2024. Aged infrastructure, no commercial backing. **Not operational in 2026.**

---

## Recommendation Ranking

| Rank | Source | Live Capable | Complexity | Risk | Why |
|------|--------|--------------|-----------|------|-----|
| 1️⃣ | **LiveF1** | ✅ Yes | Low | Low | Maintained, high-level abstraction, callbacks |
| 2️⃣ | SignalR Direct | ✅ Yes | Moderate | Moderate | Public but undocumented; requires custom client |
| 3️⃣ | FastF1 | ❌ Post-session | Low | Low | Recording-only, not live |
| 4️⃣ | Jolpica-F1 | ❌ No | Low | Low | Historical metadata only |

---

## Implementation Plan for F1_RL

**Immediate (Phase 10):** Replace `openf1_client.py` with `livef1_client.py`:
1. Swap `OpenF1Client` → `LiveF1` (via `RealF1Client` for live + Jolpica for metadata).
2. Reuse existing poll loop; adapt callbacks to feed `live_feeder.py`.
3. No paid key required; inherits F1 SignalR access.

**Fallback:** If LiveF1 becomes unmaintained, pivot to raw SignalR client (f1-telemetry Node.js as reference for decompression logic).

---

## Unresolved Questions

- Does LiveF1 handle live session throttling/backoff gracefully (429 errors)?
- SignalR endpoint—is it geographically restricted or IP-throttled?
- How stable is LiveF1's callback API across race weekends (zero breaking changes expected)?
