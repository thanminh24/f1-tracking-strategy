"""Deterministic tournament runner for strategy agents."""

from __future__ import annotations

import statistics
import time
from dataclasses import asdict, dataclass

from f1_strategy.sim.gym_env import RaceStrategyEnv
from f1_strategy.sim.params import SimParams
from f1_strategy.sim.recurrent_gym_env import RaceStrategyRecurrentEnv
from f1_strategy.strategy.evaluation.agents import StrategyAgent
from f1_strategy.strategy.evaluation.baseline import (
    PROMOTION_GATES,
    expected_points_from_positions,
)


@dataclass(frozen=True)
class EpisodeResult:
    agent: str
    seed: int
    position: int
    invalid_actions: int
    inference_ms: float


@dataclass(frozen=True)
class AgentSummary:
    agent: str
    n_sims: int
    mean_finish_position: float
    expected_points: float
    invalid_action_rate: float
    p50_inference_ms: float
    p95_inference_ms: float


def run_agent_episode(
    params: SimParams,
    agent: StrategyAgent,
    seed: int,
    sequence_len: int = 8,
    n_rivals: int = 19,
) -> EpisodeResult:
    env = _build_env(
        params,
        agent.observation_mode,
        seed=seed,
        sequence_len=sequence_len,
        n_rivals=n_rivals,
    )
    obs, _ = env.reset(seed=seed)
    done = False
    lap = 0
    invalid = 0
    inference_ms = 0.0
    info = {"position": env.n_cars}
    while not done:
        lap += 1
        t0 = time.perf_counter()
        action = agent.act(obs, lap)
        inference_ms += (time.perf_counter() - t0) * 1000.0
        obs, _, done, _, info = env.step(action)
        if "invalid_action" in info:
            invalid += 1
    return EpisodeResult(
        agent=agent.name,
        seed=seed,
        position=int(info["position"]),
        invalid_actions=invalid,
        inference_ms=inference_ms,
    )


def run_tournament(
    params: SimParams,
    agents: list[StrategyAgent],
    n_sims: int = 20,
    seed: int = 1,
    sequence_len: int = 8,
    n_rivals: int = 19,
) -> dict:
    results = []
    for agent in agents:
        for offset in range(n_sims):
            results.append(run_agent_episode(
                params,
                agent,
                seed + offset,
                sequence_len=sequence_len,
                n_rivals=n_rivals,
            ))
    summaries = summarize_results(results, params.total_laps)
    return {
        "episodes": [asdict(r) for r in results],
        "summaries": [asdict(s) for s in summaries],
    }


def summarize_results(results: list[EpisodeResult], total_laps: int) -> list[AgentSummary]:
    by_agent: dict[str, list[EpisodeResult]] = {}
    for result in results:
        by_agent.setdefault(result.agent, []).append(result)
    summaries = []
    for agent, rows in sorted(by_agent.items()):
        positions = [r.position for r in rows]
        latency = [r.inference_ms / max(total_laps, 1) for r in rows]
        invalid = sum(r.invalid_actions for r in rows)
        summaries.append(AgentSummary(
            agent=agent,
            n_sims=len(rows),
            mean_finish_position=float(statistics.fmean(positions)),
            expected_points=expected_points_from_positions(positions),
            invalid_action_rate=invalid / max(len(rows) * total_laps, 1),
            p50_inference_ms=_percentile(latency, 0.50),
            p95_inference_ms=_percentile(latency, 0.95),
        ))
    return summaries


def promotion_gate_passed(challenger: AgentSummary, baseline: AgentSummary) -> bool:
    position_gain = baseline.mean_finish_position - challenger.mean_finish_position
    points_gain_pct = (
        (challenger.expected_points - baseline.expected_points)
        / max(baseline.expected_points, 1e-9)
    )
    return (
        position_gain >= PROMOTION_GATES["mean_finish_position_gain"]
        and points_gain_pct >= PROMOTION_GATES["expected_points_gain_pct"]
        and challenger.invalid_action_rate <= PROMOTION_GATES["invalid_strategy_rate"]
        and challenger.p95_inference_ms <= PROMOTION_GATES["p95_inference_ms"]
    )


def build_promotion_report(
    summaries: list[AgentSummary],
    baseline_name: str = "ppo_current",
    challenger_prefix: str = "rsrl_",
) -> dict:
    by_name = {summary.agent: summary for summary in summaries}
    baseline = by_name.get(baseline_name)
    challenger = next((row for row in summaries if row.agent.startswith(challenger_prefix)), None)
    if baseline is None or challenger is None:
        return {
            "ready": False,
            "baseline": baseline_name if baseline is None else baseline.agent,
            "challenger": None if challenger is None else challenger.agent,
            "promote": False,
            "reason": "missing baseline or challenger summary",
        }
    position_gain = baseline.mean_finish_position - challenger.mean_finish_position
    points_gain_pct = (
        (challenger.expected_points - baseline.expected_points)
        / max(baseline.expected_points, 1e-9)
    )
    return {
        "ready": True,
        "baseline": baseline.agent,
        "challenger": challenger.agent,
        "promote": promotion_gate_passed(challenger, baseline),
        "position_gain": round(position_gain, 4),
        "expected_points_gain_pct": round(points_gain_pct, 4),
        "invalid_action_rate": challenger.invalid_action_rate,
        "p95_inference_ms": challenger.p95_inference_ms,
        "gates": PROMOTION_GATES,
    }


def _build_env(
    params: SimParams,
    observation_mode: str,
    seed: int,
    sequence_len: int,
    n_rivals: int,
):
    if observation_mode == "recurrent":
        return RaceStrategyRecurrentEnv(
            params,
            n_rivals=n_rivals,
            seed=seed,
            sequence_len=sequence_len,
            reward_mode="terminal_points",
        )
    return RaceStrategyEnv(params, n_rivals=n_rivals, seed=seed)


def _percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * q)))
    return float(ordered[idx])
