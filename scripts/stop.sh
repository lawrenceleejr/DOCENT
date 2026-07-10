#!/usr/bin/env bash
# Stop the DOCENT stack. Data volumes (pgdata, backups) are preserved.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose down
echo "Stopped. Data volumes are preserved — run scripts/start.sh to bring it back."
