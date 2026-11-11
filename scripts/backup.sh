#!/usr/bin/env bash
# Take a database backup right now (in addition to the nightly automatic one).
# The dump lands in BACKUP_DIR (./backups by default) under daily/ and is
# rotated automatically.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose exec -T backup /backup.sh
echo
echo "Latest backups:"
docker compose exec -T backup find /backups -name '*.dump' | sort | tail -n 5
