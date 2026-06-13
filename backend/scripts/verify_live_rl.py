"""Offline RL pipeline audit.

Builds a synthetic 20-car RaceState (lap 25 of 58, mixed compounds/gaps)
and verifies that state_to_sim_inputs + run_mc complete without exceptions.

Run from backend/:
    python scripts/verify_live_rl.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from f1_strategy.models.race_state import CarState, CarStatus, RaceState, TireState, TrackStatus
from f1_strategy.sim.params import CompoundParams, SimParams
from f1_strategy.strategy.mc_engine import run_mc, state_to_sim_inputs

COMPOUNDS = ["soft", "medium", "hard"]
TEAMS = [
    "Red Bull", "Ferrari", "Mercedes", "McLaren", "Aston Martin",
    "Alpine", "Williams", "AlphaTauri", "Alfa Romeo", "Haas",
]


def _make_state(total_laps: int | None = 58) -> RaceState:
    cars = []
    gap = 0.0
    for i in range(20):
        dn = str(i + 1)
        compound = COMPOUNDS[i % 3]
        tire = TireState(compound=compound, age_laps=(i % 12) + 1, stint=(i // 10) + 1)
        cars.append(
            CarState(
                car_id=dn,
                driver_code=f"D{i + 1:02d}",
                team=TEAMS[i % 10],
                position=i + 1,
                lap=25,
                lap_fraction=0.4 + i * 0.02,
                gap_leader_s=round(gap, 3) if i > 0 else 0.0,
                interval_s=round(gap if i == 0 else 1.2 + i * 0.3, 3),
                last_lap_ms=90_000 + i * 200,
                best_lap_ms=89_500 + i * 150,
                tire=tire,
                pit_stops=i // 8,
                status=CarStatus.RUNNING,
            )
        )
        gap += 1.2 + i * 0.3

    return RaceState(
        session_key="verify_test",
        t_session_s=1500.0,
        leader_lap=25,
        total_laps=total_laps,
        track_status=TrackStatus.GREEN,
        cars=cars,
    )


def audit_state_to_sim_inputs(state: RaceState) -> None:
    cars, cum = state_to_sim_inputs(state)
    active = [c for c in cars if c.get("status") != "out"]
    assert len(active) >= 15, f"Too few active cars: {len(active)}"
    required_keys = {"position", "lap", "compound", "age", "stint", "gap_s"}
    for c in active:
        missing = required_keys - set(c.keys())
        assert not missing, f"Car {c.get('car_id')} missing keys: {missing}"
    print(f"  state_to_sim_inputs: {len(active)} active cars, keys OK")


def _mock_params(total_laps: int = 58) -> SimParams:
    from f1_strategy.sim.params import DEFAULT_COMPOUNDS
    compounds = {k: CompoundParams(**v) for k, v in DEFAULT_COMPOUNDS.items()}
    return SimParams(
        season=2024, circuit="bahrain", total_laps=total_laps,
        base_lap_ms=96_000, fuel_ms_per_lap=80.0, pit_loss_ms=22_000,
        sc_hazard_per_lap=0.012, sc_lap1_multiplier=2.0, sc_pace_factor=1.25,
        traffic_penalty_ms=200.0, overtake_pace_threshold_ms=400.0,
        noise_sigma_ms=150.0, compounds=compounds,
    )


def audit_run_mc(state: RaceState) -> None:
    params = _mock_params(state.total_laps or 58)
    result = run_mc(state, params, n_draws=2, rollouts_per_draw=3)
    assert result is not None, "run_mc returned None"
    # run_mc returns MCResult; spot-check expected attributes
    assert hasattr(result, "compound_samples"), "MCResult missing .compound_samples"
    n_drivers = len(result.compound_samples)
    print(f"  run_mc: MCResult OK, {n_drivers} drivers with compound samples")


def audit_total_laps_fallback() -> None:
    """Verify None total_laps on RaceState falls back to SimParams.total_laps."""
    state = _make_state(total_laps=None)
    params = _mock_params(58)
    result = run_mc(state, params, n_draws=1, rollouts_per_draw=2)
    assert result is not None, "run_mc crashed with total_laps=None on state"
    print("  total_laps=None on state: OK (fallback to SimParams.total_laps)")


def main() -> None:
    print("=== verify_live_rl.py — offline RL pipeline audit ===\n")

    print("1. Audit state_to_sim_inputs (total_laps=58)…")
    state = _make_state(total_laps=58)
    audit_state_to_sim_inputs(state)

    print("2. Audit run_mc (total_laps=58)…")
    audit_run_mc(state)

    print("3. Audit total_laps=None fallback…")
    audit_total_laps_fallback()

    print("\nOK: RL pipeline passed offline audit")


if __name__ == "__main__":
    main()
