"""Lightweight explanation helpers for RSRL challenger decisions.

Three levels:
  1. Perturbation importance — zero a feature group and measure probability drop.
  2. Surrogate tree — shallow decision tree trained on sampled RSRL action labels.
  3. Counterfactual — minimal feature change that flips chosen action to a target.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING

import numpy as np

from f1_strategy.sim.observation_features import RSRL_FEATURE_NAMES
from f1_strategy.strategy.rsrl_agent.policy import RSRLPolicy

if TYPE_CHECKING:
    from sklearn.tree import DecisionTreeClassifier

FEATURE_GROUPS = {
    "race_progress": ["race_frac"],
    "position": ["position_norm", "gap_leader_norm"],
    "nearby_gaps": ["gap_ahead_norm", "gap_behind_norm"],
    "tyre": ["tire_age_norm", "comp_soft", "comp_medium", "comp_hard", "deg_rate_norm"],
    "pace": ["last_lap_ref"],
    "safety_car": ["sc_active"],
    "availability": ["soft_available", "medium_available", "hard_available", "valid_finish"],
    "pit_history": ["pit_stops_norm"],
    "track": ["track_norm"],
}


@dataclass(frozen=True)
class FeatureImportance:
    group: str
    action: str
    probability_delta: float

    def to_dict(self) -> dict:
        return asdict(self)


def perturbation_importance(
    policy: RSRLPolicy,
    obs_sequence: np.ndarray,
    action_labels: list[str] | None = None,
    top_n: int = 5,
) -> list[FeatureImportance]:
    """Rank feature groups by how much zeroing them changes chosen-action probability."""
    action_labels = action_labels or ["STAY", "PIT_SOFT", "PIT_MEDIUM", "PIT_HARD"]
    base_probs = _softmax(policy.q_values(obs_sequence))
    action_idx = int(np.argmax(base_probs))
    rows = []
    for group, names in FEATURE_GROUPS.items():
        perturbed = obs_sequence.copy()
        for name in names:
            if name in RSRL_FEATURE_NAMES:
                perturbed[:, RSRL_FEATURE_NAMES.index(name)] = 0.0
        probs = _softmax(policy.q_values(perturbed))
        rows.append(FeatureImportance(
            group=group,
            action=action_labels[action_idx],
            probability_delta=float(base_probs[action_idx] - probs[action_idx]),
        ))
    rows.sort(key=lambda item: abs(item.probability_delta), reverse=True)
    return rows[:top_n]


@dataclass
class SurrogateResult:
    """Shallow decision tree trained to mimic RSRL action labels."""
    tree: DecisionTreeClassifier
    fidelity: float  # fraction of sampled states where tree == RSRL
    n_samples: int
    action_labels: list[str]

    def to_dict(self) -> dict:
        return {
            "fidelity": round(self.fidelity, 4),
            "n_samples": self.n_samples,
            "action_labels": self.action_labels,
        }


def fit_surrogate_tree(
    policy: RSRLPolicy,
    sequence_len: int = 8,
    n_samples: int = 2000,
    max_depth: int = 5,
    seed: int = 42,
) -> SurrogateResult:
    """Sample random observations, label with RSRL argmax, train a shallow decision tree.

    Features are the *last* timestep of each sampled sequence (flattened recurrent
    context would be too large for a depth-5 tree to be interpretable).
    """
    from sklearn.tree import DecisionTreeClassifier

    action_labels = ["STAY", "PIT_SOFT", "PIT_MEDIUM", "PIT_HARD"]
    rng = np.random.default_rng(seed)

    # Sample sequences — uniform random in [0, 1] (features are normalised)
    seqs = rng.random((n_samples, sequence_len, len(RSRL_FEATURE_NAMES))).astype(np.float32)

    # Label with RSRL argmax over Q-values
    labels = np.array([
        int(np.argmax(_softmax(policy.q_values(seqs[i]))))
        for i in range(n_samples)
    ])

    # Use only the last timestep as tree input for interpretability
    X = seqs[:, -1, :]  # (n_samples, n_features)

    tree = DecisionTreeClassifier(max_depth=max_depth, random_state=seed)
    tree.fit(X, labels)
    fidelity = float((tree.predict(X) == labels).mean())

    return SurrogateResult(
        tree=tree, fidelity=fidelity, n_samples=n_samples, action_labels=action_labels
    )


@dataclass
class CounterfactualResult:
    original_action: str
    target_action: str
    feature_name: str
    original_value: float
    counterfactual_value: float
    found: bool

    def to_dict(self) -> dict:
        return asdict(self)


def counterfactual_flip(
    policy: RSRLPolicy,
    obs_sequence: np.ndarray,
    target_action: str,
    action_labels: list[str] | None = None,
    grid_steps: int = 20,
) -> CounterfactualResult:
    """Find the single feature whose change most cheaply flips the chosen action to target_action.

    Searches only the most impactful feature (by perturbation importance) over a
    coarse grid, then returns the smallest change that achieves the flip.
    """
    action_labels = action_labels or ["STAY", "PIT_SOFT", "PIT_MEDIUM", "PIT_HARD"]
    base_probs = _softmax(policy.q_values(obs_sequence))
    original_idx = int(np.argmax(base_probs))
    original_action = action_labels[original_idx]

    if target_action not in action_labels:
        raise ValueError(f"Unknown target_action {target_action!r}; must be one of {action_labels}")
    target_idx = action_labels.index(target_action)

    # Quick-exit: already the target
    if original_idx == target_idx:
        return CounterfactualResult(
            original_action=original_action, target_action=target_action,
            feature_name="(none)", original_value=0.0, counterfactual_value=0.0, found=True,
        )

    # Try individual scalar features at the last timestep only — faster and more interpretable
    last_t = obs_sequence.shape[0] - 1
    best: CounterfactualResult | None = None

    for feat_idx, feat_name in enumerate(RSRL_FEATURE_NAMES):
        original_val = float(obs_sequence[last_t, feat_idx])
        # Search from 0 → 1 in grid_steps, pick nearest crossing
        for v in np.linspace(0.0, 1.0, grid_steps + 1):
            probe = obs_sequence.copy()
            probe[last_t, feat_idx] = float(v)
            probs = _softmax(policy.q_values(probe))
            if int(np.argmax(probs)) == target_idx:
                delta = abs(v - original_val)
                if best is None or delta < abs(best.counterfactual_value - best.original_value):
                    best = CounterfactualResult(
                        original_action=original_action, target_action=target_action,
                        feature_name=feat_name, original_value=original_val,
                        counterfactual_value=float(v), found=True,
                    )
                break  # first crossing for this feature is enough

    if best is None:
        best = CounterfactualResult(
            original_action=original_action, target_action=target_action,
            feature_name="(none)", original_value=0.0, counterfactual_value=0.0, found=False,
        )
    return best


def _softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)
    exp = np.exp(shifted)
    return exp / max(float(exp.sum()), 1e-9)
