#!/usr/bin/env bash
# Stop backend and frontend dev servers started by start.sh
REPO="$(cd "$(dirname "$0")" && pwd)"
LOGS="$REPO/logs"

stopped=0
for name in backend frontend; do
  f="$LOGS/${name}.pid"
  if [ -f "$f" ]; then
    PID=$(cat "$f")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" && echo "Stopped $name (PID $PID)"
      stopped=$((stopped + 1))
    else
      echo "$name was not running"
    fi
    rm -f "$f"
  else
    echo "No PID file for $name"
  fi
done

[ $stopped -gt 0 ] && echo "Done." || echo "Nothing to stop."
