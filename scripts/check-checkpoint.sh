#!/usr/bin/env bash
# Gate checkpoint changes: backend tests + frontend build/lint/unit tests.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Backend tests"
cd "$REPO/backend"
uv run pytest tests/ -q

echo "==> Frontend build"
cd "$REPO/frontend"
npm run build

echo "==> Frontend lint"
npm run lint

echo "==> Frontend unit tests"
npm run test

echo ""
echo "Checkpoint OK"
