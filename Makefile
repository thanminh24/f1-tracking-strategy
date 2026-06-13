# F1 Viewer + RL Strategy System — dev entrypoints
# Backend uses uv (https://docs.astral.sh/uv/); frontend uses npm.

UV := uv
BACKEND := cd backend &&

.PHONY: dev dev-backend dev-frontend start stop status test lint ingest ingest-backfill build-archive-db clean-scratch calibrate-all train-models train-ppo

start: ## background both servers, logs in ./logs/ (use stop to shut down)
	./start.sh

stop: ## stop background servers started by start.sh
	./stop.sh

status: ## show whether backend/frontend are running
	@for name in backend frontend; do \
	  f=logs/$$name.pid; \
	  if [ -f "$$f" ]; then \
	    PID=$$(cat "$$f"); \
	    if kill -0 "$$PID" 2>/dev/null; then \
	      echo "$$name running (PID $$PID)"; \
	    else \
	      echo "$$name stale PID $$PID (not running)"; \
	    fi; \
	  else \
	    echo "$$name not started"; \
	  fi; \
	done

dev: ## run backend :8000 + frontend :3000 concurrently (foreground)
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

# Fit SimParams for all (season, circuit) pairs in the archive.
# Run after ingest-backfill completes. Add ARGS="--season 2024" to restrict.
calibrate-all:
	$(BACKEND) $(UV) run f1-batch-calibrate $(ARGS)

train-models: ## fit SC hazard + behavior model from archive
	$(BACKEND) $(UV) run f1-train-models

train-ppo: ## train + eval PPO for one circuit; pass ARGS="--season 2024 --circuit Sakhir --device cuda"
	$(BACKEND) $(UV) run f1-train-ppo $(ARGS)

# drop viewer-retrieved sessions (data/scratch_parquet); archive is untouched
clean-scratch:
	$(BACKEND) $(UV) run f1-ingest --purge-scratch
