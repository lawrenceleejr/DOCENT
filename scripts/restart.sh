#!/usr/bin/env bash
# Restart the running containers (no rebuild).
# To pick up new code, use scripts/start.sh instead (it rebuilds).
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose restart
docker compose ps
