"""FastAPI application entrypoint. Routers are registered as phases land."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from f1_strategy import __version__
from f1_strategy.api.routes_archive import router as archive_router
from f1_strategy.api.routes_live import router as live_router
from f1_strategy.api.routes_source import router as source_router
from f1_strategy.api.routes_whatif import router as whatif_router
from f1_strategy.api.ws_feeder import router as feeder_router
from f1_strategy.api.ws_replay import router as replay_router

app = FastAPI(title="F1 Strategy API", version=__version__)
app.include_router(archive_router)
app.include_router(replay_router)   # legacy /ws/replay/{key} — backward compat
app.include_router(feeder_router)   # /ws/feed/{key} — IFeeder-backed
app.include_router(source_router)   # /api/sessions/{key}/source
app.include_router(live_router)     # /api/live/current-session
app.include_router(whatif_router)

# CORS_ORIGINS env var: comma-separated list of allowed origins.
# Default allows local dev + Docker Compose internal traffic.
_cors_env = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://frontend:3000")
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"http://localhost:\d+",  # any localhost port in dev
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__}
