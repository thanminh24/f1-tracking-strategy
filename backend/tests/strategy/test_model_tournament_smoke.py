from f1_strategy.sim.params import CompoundParams, SimParams
from f1_strategy.strategy.evaluation.agents import fixed_one_stop_agent, fixed_two_stop_agent
from f1_strategy.strategy.evaluation.tournament import (
    AgentSummary,
    build_promotion_report,
    promotion_gate_passed,
    run_tournament,
)


def toy_params(total_laps: int = 50) -> SimParams:
    return SimParams(
        season=2024,
        circuit="Testville",
        total_laps=total_laps,
        base_lap_ms=90000,
        fuel_ms_per_lap=60,
        pit_loss_ms=21000,
        sc_hazard_per_lap=0.004,
        sc_lap1_multiplier=8,
        sc_pace_factor=1.45,
        traffic_penalty_ms=350,
        overtake_pace_threshold_ms=600,
        noise_sigma_ms=400,
        compounds={
            "SOFT": CompoundParams(-400, 90, 100),
            "MEDIUM": CompoundParams(0, 55, 100),
            "HARD": CompoundParams(500, 35, 100),
        },
        driver_offsets_ms={"0": -300, "1": -200, "2": 0, "3": 150},
    )


def test_model_tournament_runs_fixed_baselines():
    params = toy_params(8)
    result = run_tournament(
        params,
        [fixed_one_stop_agent(params.total_laps), fixed_two_stop_agent(params.total_laps)],
        n_sims=2,
        seed=5,
        sequence_len=3,
        n_rivals=3,
    )
    assert len(result["episodes"]) == 4
    summaries = {row["agent"]: row for row in result["summaries"]}
    assert set(summaries) == {"fixed_one_stop", "fixed_two_stop"}
    assert summaries["fixed_one_stop"]["n_sims"] == 2


def test_promotion_gate_requires_all_thresholds():
    baseline = AgentSummary("ppo_current", 10, 5.5, 10.0, 0.0, 1.0, 10.0)
    challenger = AgentSummary("rsrl", 10, 5.0, 11.0, 0.0, 1.0, 10.0)
    assert promotion_gate_passed(challenger, baseline)
    bad = AgentSummary("rsrl", 10, 5.0, 11.0, 0.01, 1.0, 10.0)
    assert not promotion_gate_passed(bad, baseline)


def test_promotion_report_requires_matching_baseline_and_challenger():
    report = build_promotion_report(
        [
            AgentSummary("ppo_current", 8, 6.0, 8.0, 0.0, 1.0, 9.0),
            AgentSummary("rsrl_2024_Testville", 8, 5.5, 9.0, 0.0, 1.0, 9.0),
        ]
    )
    assert report["ready"] is True
    assert report["baseline"] == "ppo_current"
    assert report["challenger"] == "rsrl_2024_Testville"
