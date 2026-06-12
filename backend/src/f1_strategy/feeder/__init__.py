"""Feeder abstraction: IFeeder protocol + ArchiveFeeder + LiveFeeder stub.

ArchiveFeeder replays parquet-backed race data through the existing ReplaySource.
LiveFeeder (stub here; phase 5 fills in OpenF1 polling) satisfies the same interface.
The FeederRegistry manages one active FeederSession per session_key with fan-out queues.
"""

from f1_strategy.feeder.archive_feeder import ArchiveFeeder
from f1_strategy.feeder.live_feeder import LiveFeeder
from f1_strategy.feeder.livef1_feeder import LiveF1Feeder
from f1_strategy.feeder.protocol import IFeeder
from f1_strategy.feeder.session_registry import FeederRegistry, registry

__all__ = ["IFeeder", "ArchiveFeeder", "LiveFeeder", "LiveF1Feeder", "FeederRegistry", "registry"]
