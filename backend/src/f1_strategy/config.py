"""Central path/settings configuration. All data locations derive from DATA_DIR."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Env-overridable settings (prefix F1_, e.g. F1_DATA_DIR=/mnt/data)."""

    model_config = SettingsConfigDict(env_prefix="F1_")

    # Repo-root-relative default; resolved to absolute in model_post_init.
    data_dir: Path = Path(__file__).resolve().parents[3] / "data"

    @property
    def parquet_dir(self) -> Path:
        return self.data_dir / "parquet"

    @property
    def duckdb_path(self) -> Path:
        return self.data_dir / "archive.duckdb"

    @property
    def scratch_parquet_dir(self) -> Path:
        """Purgeable tier for viewer-retrieved sessions; never used as archive."""
        return self.data_dir / "scratch_parquet"

    @property
    def fastf1_cache_dir(self) -> Path:
        return self.data_dir / "fastf1_cache"

    @property
    def telemetry_cache_dir(self) -> Path:
        return self.data_dir / "telemetry_cache"

    @property
    def calibration_dir(self) -> Path:
        return self.data_dir / "calibration"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    def ensure_dirs(self) -> None:
        for p in (
            self.parquet_dir,
            self.scratch_parquet_dir,
            self.fastf1_cache_dir,
            self.telemetry_cache_dir,
            self.calibration_dir,
            self.models_dir,
        ):
            p.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
