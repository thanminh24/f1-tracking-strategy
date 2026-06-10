# Brainstorm Report — F1 Viewer + RL Strategy System

Date: 2026-06-10 | Status: APPROVED by user | Repo: greenfield (empty)

## Problem Statement

Build local-first F1 viewer helper: per-driver telemetry, archival race data 2024→now, ML/RL strategy layer visualizing race strategy in (simulated) real time. No existing tool combines live-style viewer + strategy prediction brain.

## Research Findings (similar systems)

| System | What it does | Gap |
|---|---|---|
| [FastF1](https://github.com/theOehrly/Fast-F1) | Python lib, historical timing+telemetry 2018+, free | Post-session analysis only, no UI |
| [OpenF1](https://openf1.org/) | REST API, historical 2023+ free; **realtime now paid**, 3 req/s free tier | Cost + external dep for live |
| [f1-dash](https://github.com/slowlydev/f1-dash) | OSS real-time dashboard (Rust+Next.js), direct F1 SignalR | No strategy/prediction layer |
| [MultiViewer](https://multiviewer.app/) | Gold-standard desktop companion, F1TV multi-feed | Needs F1TV sub, no predictions |
| undercutf1 | TUI live timing via SignalR | Niche, no ML |
| [Explainable RL for F1 Strategy (arXiv 2501.04068)](https://arxiv.org/html/2501.04068v1) | Mercedes collab, RL pit decisions ~5s from optimal | Research only, no viewer |
| [Learning-Based F1 Strategies (arXiv 2512.21570)](https://arxiv.org/abs/2512.21570), [multi-agent (arXiv 2602.23056)](https://arxiv.org/pdf/2602.23056) | RL agents: tire deg, pit timing, opponents; DRQN +8.6s vs fixed | Research only |
| [pit-stop-simulator](https://github.com/rembertdesigns/pit-stop-simulator) | PPO/Q-learning toy sim + Streamlit | Toy fidelity |

**Gap filled:** viewer dashboard + RL strategy brain glued together, replayable, eventually live.

## Confirmed Requirements

- **Output:** local-first web app. FastAPI backend + Next.js/React frontend.
- **Archive:** 2024→now, all sessions. Laps/stints/pits/positions/weather/race-control/results stored full (Parquet+DuckDB, ~few GB). Car telemetry on-demand via FastF1 cache.
- **Live data:** replay-first ("simulated live" from archive, variable speed). `LiveSource` interface; SignalR live adapter = v2.
- **RL/ML scope (ALL):** optimal strategy overlay (RL), team behavior prediction (supervised), outcome probabilities (MC rollouts), what-if explorer, SC hazard model.
- **Prediction framing:** probabilistic ONLY (user confirmed). SC = per-lap hazard %, strategies = distributions, outcomes = probabilities. No deterministic calls.
- **Build order:** everything in v1 scope; phases below = order only.
- **Hardware:** RTX 4060 laptop. Sim = lap-level → PPO trains fine.
- **Deployment:** local only (no hosting/auth/licensing exposure).

## Approved Architecture

```
FastF1 ingestion → Parquet+DuckDB archive (laps/stints/pits/pos/weather/RC/results)
                   telemetry on-demand via FastF1 cache
        ↓
Replay Engine → RaceState ticks @ 1×/2×/10×/jump (LiveSource interface)
        ↓
Strategy Brain:
  • Race Simulator — lap-level Gymnasium env (tire deg fitted per compound×track
    from archive, fuel effect, pit loss, traffic, SC hazard process)
  • PPO agent (SB3) — optimal pit/compound policy
  • Team behavior model — gradient boosting (small data: ~50-60 races)
  • SC hazard model — per-lap P(SC)
  • MC rollouts — outcome probs + what-if API
        ↓
FastAPI — REST (archive/telemetry/what-if) + WebSocket (ticks+predictions)
        ↓
Next.js frontend — archive browser, track map (SVG from position data),
  timing tower, gap chart, tire/stint bars, telemetry traces + driver compare,
  strategy overlay (pit windows, recommended action, undercut alerts,
  SC prob, outcome probs), what-if panel
```

## Stack Decisions

| Layer | Choice | Rationale |
|---|---|---|
| Storage | Parquet + DuckDB | Columnar analytics, zero server, read-heavy |
| Ingestion | FastF1 (OpenF1 secondary) | Free, complete 2024+ |
| Sim | Lap-level discrete | Matches published RL research; CPU/4060-trainable; physics sim = rabbit hole |
| RL | Gymnasium + SB3 PPO | Standard, debuggable |
| Backend | FastAPI + WebSocket | Python-native for FastF1/RL |
| Frontend | Next.js + React | Rich real-time viz |

## Rejected Alternatives

- Streamlit monolith — rerun model fights real-time maps/overlays.
- Rust backend + Python sidecar — 2 languages, bottleneck is ML inference not throughput.
- OpenF1 paid realtime / direct SignalR now — deferred; replay-first de-risks (testable any day vs 24 weekends/yr).
- Deterministic predictions — rejected; wrong headline calls destroy trust.

## Phases (order only — all in scope)

1. Foundation: scaffold, ingestion pipeline, 2024→now archive, DuckDB schema
2. Replay engine + API: tick stream, WebSocket, playback controls
3. Viewer frontend: archive browser, dashboard, track map, telemetry charts
4. Simulator + calibration: Gymnasium env, deg/pit-loss fitting, **validation gate vs held-out real races**
5. ML/RL: PPO agent, behavior model, SC hazard, MC outcomes
6. Strategy UI: overlay, what-if, probability panels
7. (v2) Live SignalR `LiveSource` adapter

## Live Adapter Detail (SignalR, phase 7)

- F1 live timing = public unauthenticated SignalR endpoint (`livetiming.formula1.com`), legacy ASP.NET protocol. Topics: `TimingData`, `CarData.z`, `Position.z`, `WeatherData`, `RaceControlMessages`, `SessionInfo`.
- Transport easy (FastF1 ships client; f1-dash/undercutf1 = reference impls). Real work = parsing: feed sends JSON *patches* to merge into big state object; `.z` topics = deflate+base64. Undocumented, can change without notice.
- Mitigation for weekend-only availability: **record raw stream during 1-2 sessions** (FastF1 supports), develop parser offline vs recordings, live session only for final smoke test. Estimate: moderate, confined to one `LiveSource` adapter module.

## WEC / Multi-Series Applicability (assessed, OUT of scope)

- Transfers cleanly: replay engine, tick protocol, API/WebSocket, UI shell, MC rollout framework, probabilistic framing.
- Does NOT transfer: data (no FastF1 equivalent; Al Kamel official timing prohibits redistribution, live = paid FIAWEC+; post-session lap CSVs free; zero public car telemetry) + simulator (refueling, driver stint rules, multi-class traffic, slow zones/FCY, 24h night/weather — substantial new sim, not param tweak).
- **Design decision adopted:** core `RaceState` schema + tick protocol must NOT hardcode F1 assumptions (20 cars, no refueling, single class, single SC regime). Cheap now; makes WEC a v3 module instead of rewrite.
- Optional manual action: download Al Kamel lap CSVs after Le Mans 2026 to bank data.

## Risks

1. **Sim fidelity** — bad deg fits poison everything downstream. Mitigation: phase-4 validation gate before RL.
2. **Small behavior data** (~50-60 races) — use feature-based GBM, pool teams, accept wide distributions.
3. **2026 reg change** — 2024-25 deg curves don't transfer. Mitigation: per-season calibration params from day one.
4. **FastF1/FOM ToS** — fine local/personal; public hosting = licensing risk (deferred with local-first).

## Success Criteria

- Replay any 2024+ race with live-style dashboard + full telemetry on demand
- Sim validation: simulated race times within agreed tolerance of real held-out races
- RL agent beats fixed 1-stop/2-stop baselines in sim
- Per-lap live: recommended action, pit windows, SC %, outcome probs, what-if rollouts < few sec

## Next Steps

→ `/ck:plan` with this report as context.

## Unresolved Questions

- Sim validation tolerance (define in plan phase, e.g. median race-time error < X s)
- Track map source: derive SVG from position data vs community track geometry files (decide phase 3)
- Behavior model target encoding (next-pit-lap distribution vs per-lap pit probability) — decide phase 5
