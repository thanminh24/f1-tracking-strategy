"""Feeder exports.

Keep package imports lightweight so the live-core runtime can start without
archive/replay dependencies installed.
"""

from f1_strategy.feeder.protocol import IFeeder
from f1_strategy.feeder.session_registry import FeederRegistry, registry

__all__ = ["IFeeder", "FeederRegistry", "registry"]
