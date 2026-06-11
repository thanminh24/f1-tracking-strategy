"""FastAPI application entrypoint. Routers are registered as phases land."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from f1_strategy import __version__
from f1_strategy.api.routes_archive import router as archive_router
from f1_strategy.api.routes_whatif import router as whatif_router
from f1_strategy.api.ws_replay import router as replay_router

app = FastAPI(title="F1 Strategy API", version=__version__)
app.include_router(archive_router)
app.include_router(replay_router)
app.include_router(whatif_router)

# Local-first: frontend dev server is the only expected origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__}
