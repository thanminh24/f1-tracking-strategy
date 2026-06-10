"""Strategy encodings for the simulator.

Fixed mode: per-car list of (pit_lap, new_compound).
Policy mode: callback invoked each lap with the focal car's view (used by RL in phase 7).
"""

from collections.abc import Callable
from dataclasses import dataclass


@dataclass
class FixedStrategy:
    start_compound: str
    stops: list[tuple[int, str]]  # (pit at end of lap, new compound)

    def pit_at(self, lap: int) -> str | None:
        for pit_lap, compound in self.stops:
            if pit_lap == lap:
                return compound
        return None


# Policy signature: (lap, car_view: dict) -> new compound to pit onto, or None to stay out.
PolicyFn = Callable[[int, dict], str | None]


def one_stop(total_laps: int, c1: str = "MEDIUM", c2: str = "HARD") -> FixedStrategy:
    return FixedStrategy(c1, [(total_laps // 2, c2)])


def two_stop(total_laps: int, c1="SOFT", c2="HARD", c3="HARD") -> FixedStrategy:
    return FixedStrategy(c1, [(total_laps // 3, c2), (2 * total_laps // 3, c3)])
