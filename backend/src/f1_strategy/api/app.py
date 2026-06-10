"""FastAPI application entrypoint. Routers are registered as phases land."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from f1_strategy import __version__

app = FastAPI(title="F1 Strategy API", version=__version__)

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
