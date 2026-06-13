#!/usr/bin/env bash
# One-shot local dev bring-up: backend :8000 + frontend :3000
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
LOGS="$REPO/logs"
mkdir -p "$LOGS"

stop_existing() {
  for f in "$LOGS/backend.pid" "$LOGS/frontend.pid"; do
    if [ -f "$f" ]; then
      PID=$(cat "$f")
      if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null || true
      fi
      rm -f "$f"
    fi
  done
}

stop_existing

# Backend
echo "Starting backend..."
cd "$REPO/backend"
uv run uvicorn f1_strategy.api.app:app --reload --port 8000 \
  >> "$LOGS/backend.log" 2>&1 &
echo $! > "$LOGS/backend.pid"

# Frontend
echo "Starting frontend..."
cd "$REPO/frontend"
npm run dev >> "$LOGS/frontend.log" 2>&1 &
echo $! > "$LOGS/frontend.pid"

echo ""
echo "  Backend  → http://localhost:8000   (log: logs/backend.log)"
echo "  Frontend → http://localhost:3000   (log: logs/frontend.log)"
echo ""
echo "  Run ./stop.sh to shut down both."
