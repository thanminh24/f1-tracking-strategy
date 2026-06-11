# F1 Viewer + RL Strategy System — dev entrypoints
# Backend uses uv (https://docs.astral.sh/uv/); frontend uses npm.

UV := uv
BACKEND := cd backend &&

.PHONY: dev dev-backend dev-frontend test lint ingest ingest-backfill build-archive-db clean-scratch

dev: ## run backend :8000 + frontend :3000 concurrently
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	$(BACKEND) $(UV) run uvicorn f1_strategy.api.app:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

test:
	$(BACKEND) $(UV) run pytest -q

lint:
	$(BACKEND) $(UV) run ruff check .

# Usage: make ingest ARGS="--year 2024 --round 1"
ingest:
	$(BACKEND) $(UV) run f1-ingest $(ARGS)

ingest-backfill:
	$(BACKEND) $(UV) run f1-ingest --backfill

build-archive-db:
	$(BACKEND) $(UV) run f1-build-archive-db --force

# drop viewer-retrieved sessions (data/scratch_parquet); archive is untouched
clean-scratch:
	$(BACKEND) $(UV) run f1-ingest --purge-scratch
