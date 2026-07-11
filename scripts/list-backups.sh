#!/usr/bin/env bash
# List all database backups currently held in the `backups` volume.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose exec -T backup sh -c 'ls -lh /backups/daily /backups/weekly /backups/monthly 2>/dev/null'
