"""Train and evaluate the RSRL challenger DRQN."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from f1_strategy.config import get_settings
from f1_strategy.sim.observation_features import RSRL_FEATURE_NAMES
from f1_strategy.sim.params import SimParams
from f1_strategy.sim.recurrent_gym_env import RaceStrategyRecurrentEnv
from f1_strategy.strategy.rsrl_agent.model import DRQN
from f1_strategy.strategy.rsrl_agent.replay_buffer import SequenceReplayBuffer


def checkpoint_path(season: int, circuit: str) -> Path:
    return get_settings().models_dir / f"rsrl_{season}_{circuit}.pt"


def train_on_params(
    params: SimParams,
    timesteps: int = 20_000,
    seed: int = 0,
    device: str = "cpu",
    sequence_len: int = 8,
) -> DRQN:
    import torch
    import torch.nn.functional as F

    rng = np.random.default_rng(seed)
    env = RaceStrategyRecurrentEnv(params, seed=seed, sequence_len=sequence_len)
    feature_dim = len(RSRL_FEATURE_NAMES)
    policy = DRQN(feature_dim).to(device)
    target = DRQN(feature_dim).to(device)
    target.load_state_dict(policy.state_dict())
    optim = torch.optim.Adam(policy.parameters(), lr=1e-3, weight_decay=1e-4)
    replay = SequenceReplayBuffer(seed=seed)
    obs, _ = env.reset(seed=seed)
    gamma = 0.99

    for step in range(1, timesteps + 1):
        epsilon = max(0.05, 1.0 - step / max(timesteps * 0.8, 1))
        if rng.random() < epsilon:
            action = int(env.action_space.sample())
        else:
            with torch.no_grad():
                q, _ = policy(torch.as_tensor(obs[None], dtype=torch.float32, device=device))
                action = int(torch.argmax(q[:, -1, :], dim=1).item())
        next_obs, reward, done, _, _ = env.step(action)
        replay.add(obs, action, reward, next_obs, done)
        obs = next_obs
        if done:
            obs, _ = env.reset(seed=int(rng.integers(2**31)))

        if len(replay) >= 32:
            batch = replay.sample(32)
            obs_t = torch.as_tensor(batch.obs, dtype=torch.float32, device=device)
            next_t = torch.as_tensor(batch.next_obs, dtype=torch.float32, device=device)
            action_t = torch.as_tensor(batch.actions, dtype=torch.int64, device=device)
            reward_t = torch.as_tensor(batch.rewards, dtype=torch.float32, device=device)
            done_t = torch.as_tensor(batch.dones, dtype=torch.float32, device=device)
            q, _ = policy(obs_t)
            q_action = q[:, -1, :].gather(1, action_t[:, None]).squeeze(1)
            with torch.no_grad():
                q_next, _ = target(next_t)
                target_val = reward_t + gamma * (1.0 - done_t) * q_next[:, -1, :].max(dim=1).values
            loss = F.huber_loss(q_action, target_val)
            optim.zero_grad()
            loss.backward()
            optim.step()
        if step % 250 == 0:
            target.load_state_dict(policy.state_dict())
    return policy


def train(
    season: int,
    circuit: str,
    timesteps: int = 200_000,
    seed: int = 0,
    device: str = "cpu",
    sequence_len: int = 8,
) -> DRQN:
    import torch

    params = SimParams.load(season, circuit)
    model = train_on_params(params, timesteps, seed, device, sequence_len)
    path = checkpoint_path(season, circuit)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "state_dict": model.state_dict(),
            "feature_names": RSRL_FEATURE_NAMES,
            "feature_dim": len(RSRL_FEATURE_NAMES),
            "action_dim": 4,
            "hidden_dim": model.hidden_dim,
            "season": season,
            "circuit": circuit,
            "sequence_len": sequence_len,
            "timesteps": timesteps,
            "seed": seed,
        },
        path,
    )
    return model


def evaluate_on_params(
    params: SimParams,
    model: DRQN,
    n_sims: int = 20,
    seed: int = 1,
    device: str = "cpu",
    sequence_len: int = 8,
) -> dict:
    import torch

    positions = []
    for idx in range(n_sims):
        env = RaceStrategyRecurrentEnv(params, seed=seed + idx, sequence_len=sequence_len)
        obs, _ = env.reset(seed=seed + idx)
        done = False
        info = {"position": env.n_cars}
        while not done:
            with torch.no_grad():
                q, _ = model(torch.as_tensor(obs[None], dtype=torch.float32, device=device))
                action = int(torch.argmax(q[:, -1, :], dim=1).item())
            obs, _, done, _, info = env.step(action)
        positions.append(int(info["position"]))
    arr = np.array(positions, dtype=float)
    return {
        "rsrl_mean_position": float(arr.mean()),
        "n_sims": n_sims,
        "seed": seed,
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="f1-train-rsrl")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--circuit", required=True)
    parser.add_argument("--timesteps", type=int, default=200_000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--sequence-len", type=int, default=8)
    args = parser.parse_args()
    train(args.season, args.circuit, args.timesteps, args.seed, args.device, args.sequence_len)
    print(json.dumps({"checkpoint": str(checkpoint_path(args.season, args.circuit))}, indent=2))


if __name__ == "__main__":
    main()
