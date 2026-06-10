"""Build a deterministic race timeline from archived laps; pure `state_at(t)` snapshots.

Gap model: per-car piecewise-linear progress (laps completed + fraction) over session
time; gap-to-leader = now minus the time the leader passed the car's current progress
(np.interp on the leader's cumulative lap times). Mid-lap values are interpolated —
approximate by design (lap-level data), fine for viewer pacing.
"""

import numpy as np
import pandas as pd

from f1_strategy.models import CarState, CarStatus, RaceState, TireState, TrackStatus

# FastF1 lap track_status digit → severity (worst digit on track wins the tick)
_STATUS_BY_DIGIT = {"5": TrackStatus.RED, "4": TrackStatus.SC, "6": TrackStatus.VSC,
                    "7": TrackStatus.VSC, "2": TrackStatus.YELLOW_ZONE}
_SEVERITY = [TrackStatus.RED, TrackStatus.SC, TrackStatus.VSC, TrackStatus.YELLOW_ZONE]


class CarTimeline:
    """Per-car arrays indexed by completed-lap count."""

    def __init__(self, car_id: str, g: pd.DataFrame):
        g = g.dropna(subset=["lap_number", "lap_start_ms"]).sort_values("lap_number")
        self.car_id = car_id
        self.driver_code = g["driver_code"].iloc[0]
        self.team = g["team"].iloc[0]
        self.starts = g["lap_start_ms"].to_numpy(dtype=float)
        durations = g["lap_time_ms"].to_numpy(dtype=float)
        # Untimed laps (lap 1, SC chaos): infer from next start or median pace
        med = np.nanmedian(durations) if np.isfinite(durations).any() else 100_000.0
        next_starts = np.append(self.starts[1:], np.nan)
        durations = np.where(np.isnan(durations), next_starts - self.starts, durations)
        self.durations = np.where(np.isnan(durations), med, durations)
        self.cum_times = self.starts + self.durations  # time lap k was completed
        self.lap_numbers = g["lap_number"].to_numpy(dtype=int)
        self.compounds = g["compound"].tolist()
        self.tyre_life = g["tyre_life"].fillna(0).to_numpy(dtype=int)
        self.stints = g["stint"].fillna(1).to_numpy(dtype=int)
        self.pit_in = g["pit_in_ms"].to_numpy(dtype=float)
        self.pit_out = g["pit_out_ms"].to_numpy(dtype=float)
        self.n_stops_cum = np.cumsum(~np.isnan(self.pit_in)).astype(int)
        self.track_status = g["track_status"].astype(str).tolist()

    def progress_at(self, t: float) -> float:
        """Laps completed + in-lap fraction at session time t (ms)."""
        if t <= self.starts[0]:
            return 0.0
        idx = int(np.searchsorted(self.starts, t, side="right") - 1)
        idx = min(idx, len(self.starts) - 1)
        frac = (t - self.starts[idx]) / max(self.durations[idx], 1.0)
        return idx + min(max(frac, 0.0), 1.0)

    def time_at_progress(self, p: float) -> float:
        """Inverse of progress_at — session time when this car reached progress p."""
        grid = np.arange(len(self.cum_times) + 1, dtype=float)
        times = np.concatenate(([self.starts[0]], self.cum_times))
        return float(np.interp(p, grid, times))


class RaceTimeline:
    def __init__(self, session_key: str, laps_df: pd.DataFrame, total_laps: int | None,
                 finish_positions: dict[str, int] | None = None):
        self.session_key = session_key
        self.total_laps = total_laps
        self.finish_positions = finish_positions or {}
        self.cars = [CarTimeline(cid, g) for cid, g in laps_df.groupby("car_id")]
        self.t_start = min(c.starts[0] for c in self.cars)
        self.t_end = max(c.cum_times[-1] for c in self.cars)
        # worst track status per lap number across the field
        self._status_by_lap: dict[int, TrackStatus] = {}
        for car in self.cars:
            for lap_no, st in zip(car.lap_numbers, car.track_status, strict=False):
                digits = set(st)
                for status in _SEVERITY:
                    if any(_STATUS_BY_DIGIT.get(d) == status for d in digits):
                        prev = self._status_by_lap.get(lap_no, TrackStatus.GREEN)
                        if _SEVERITY.index(status) < (
                            _SEVERITY.index(prev) if prev in _SEVERITY else 99
                        ):
                            self._status_by_lap[lap_no] = status
                        break

    def state_at(self, t: float) -> RaceState:
        """Pure, deterministic snapshot at session time t (ms)."""
        t = min(max(t, self.t_start), self.t_end)
        progress = {c.car_id: c.progress_at(t) for c in self.cars}
        order = sorted(self.cars, key=lambda c: progress[c.car_id], reverse=True)
        leader = order[0]
        car_states, prev = [], None
        for pos, car in enumerate(order, start=1):
            p = progress[car.car_id]
            idx = min(int(p), len(car.lap_numbers) - 1)
            finished = self.total_laps and car.lap_numbers[-1] >= self.total_laps \
                and t >= car.cum_times[-1]
            retired = not finished and t > car.cum_times[-1] + 120_000  # 2min silence = out
            in_pit_window = (not np.isnan(car.pit_in[idx]) and t >= car.pit_in[idx]) or (
                not np.isnan(car.pit_out[idx]) and t <= car.pit_out[idx]
            )
            status = (
                CarStatus.FINISHED if finished
                else CarStatus.OUT if retired
                else CarStatus.PITTING if in_pit_window
                else CarStatus.RUNNING
            )
            if finished and car.car_id in self.finish_positions:
                pos = self.finish_positions[car.car_id]
            gap = max(0.0, (t - leader.time_at_progress(p)) / 1000) if car is not leader else 0.0
            interval = (
                max(0.0, (t - prev.time_at_progress(p)) / 1000) if prev is not None else None
            )
            car_states.append(
                CarState(
                    car_id=car.car_id, driver_code=car.driver_code, team=car.team,
                    position=pos, lap=int(car.lap_numbers[idx]),
                    lap_fraction=round(p - int(p), 4),
                    gap_leader_s=round(gap, 2), interval_s=round(interval, 2) if interval else None,
                    last_lap_ms=int(car.durations[idx - 1]) if idx > 0 else None,
                    tire=TireState(compound=car.compounds[idx], age_laps=int(car.tyre_life[idx]),
                                   stint=int(car.stints[idx])),
                    pit_stops=int(car.n_stops_cum[idx]), status=status,
                )
            )
            prev = car
        leader_lap = int(leader.lap_numbers[min(int(progress[leader.car_id]),
                                                len(leader.lap_numbers) - 1)])
        return RaceState(
            session_key=self.session_key, t_session_s=round(t / 1000, 1),
            leader_lap=leader_lap, total_laps=self.total_laps,
            track_status=self._status_by_lap.get(leader_lap, TrackStatus.GREEN),
            cars=car_states,
        )
