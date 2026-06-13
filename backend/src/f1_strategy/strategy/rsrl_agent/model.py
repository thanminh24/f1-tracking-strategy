"""Small DRQN model for the RSRL challenger."""

from __future__ import annotations

import torch
from torch import nn


class DRQN(nn.Module):
    """GRU-based Q-network over strategy feature sequences."""

    def __init__(self, feature_dim: int, action_dim: int = 4, hidden_dim: int = 64):
        super().__init__()
        self.feature_dim = feature_dim
        self.action_dim = action_dim
        self.hidden_dim = hidden_dim
        self.encoder = nn.Linear(feature_dim, hidden_dim)
        self.gru = nn.GRU(hidden_dim, hidden_dim, batch_first=True)
        self.head = nn.Linear(hidden_dim, action_dim)

    def forward(
        self,
        obs: torch.Tensor,
        hidden: torch.Tensor | None = None,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        x = torch.relu(self.encoder(obs))
        seq, hidden = self.gru(x, hidden)
        return self.head(seq), hidden
