#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"
uv run f1-ingest --backfill "$@"
