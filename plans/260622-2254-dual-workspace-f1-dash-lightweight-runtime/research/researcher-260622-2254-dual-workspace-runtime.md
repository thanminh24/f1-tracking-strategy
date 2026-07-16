# Dual-workspace and lightweight runtime research

Date: 2026-06-22

## Recommendation

The idea works as one application with shared state and headless widgets. Broadcast should be the familiar default; Pit Wall the decision surface. Prefer a clean-room visual recreation: vendored F1 Dash is AGPL-3.0 and this project has no root license decision.

Default Docker should be live-core. Local data is about 1.9 GiB, mostly FastF1 cache, and must not enter images. Package weight still matters: installed Torch is about 1.08 GiB, PyArrow 147 MiB, SciPy 109 MiB, and DuckDB 58 MiB. Splitting dependencies matters more than deleting cache alone.

## Repository evidence

- Next.js already enables standalone output and internal backend rewrites.
- Backend base dependencies mix live API, archive, analytics, training, and inference.
- Eager archive imports prevent a genuinely minimal boot.
- StrategyPanel already combines model comparison, SC gauge, pit window, what-if, and radio, but is not mounted.
- FastF1 archive radio path is broken; live SignalR and OpenF1 provide viable capture sources.
- PPO/RS-RL evidence does not establish a best model; evaluation needs temporal, multi-circuit, multi-seed tests.

## Primary references consulted

- Next.js standalone-output documentation.
- uv production container guidance.
- Docker multi-stage image guidance.
- ONNX Runtime CPU installation and Python guidance.
- Stable-Baselines3 model-export guidance.

## Risks

| Risk | Countermeasure |
|---|---|
| Workspaces diverge | Shared store/selectors/headless widgets |
| Clone license exposure | Clean-room decision and asset inventory first |
| Fixture hides protocol gaps | Separate validation labels; next-race runbook |
| Lite image stays huge | Split locks; export inference or keep strategy optional |
| Optional APIs break UI | Capability manifest and graceful states |
| Radio absent/late | Unified contract, retry/backoff, honest empty state |
| “Best model” overclaim | Predeclared benchmark, leakage audit, seeds/circuits |

## Unresolved questions

- Public or private distribution?
- Hard size/startup budgets?
- May analysis use an explicit Compose override?
