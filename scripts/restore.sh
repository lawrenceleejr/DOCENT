#!/usr/bin/env bash
# Restore the database from a backup. Stops the backend during the restore so
# nothing writes mid-restore, then restarts it.
#   Usage: scripts/restore.sh <path-relative-to-/backups>
#   e.g.:  scripts/restore.sh daily/docent-2026-07-10.dump
#
# Run scripts/list-backups.sh first to see what's available.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -ne 1 ]; then
    echo "Usage: scripts/restore.sh <path-relative-to-/backups>" >&2
    echo "Available backups:" >&2
    docker compose exec -T backup find /backups -name '*.dump' | sort >&2
    exit 1
fi

echo "Restoring from $1 — this OVERWRITES the current database."
printf "Type 'yes' to continue: "
read -r confirm
[ "$confirm" = "yes" ] || { echo "Aborted."; exit 1; }

docker compose stop backend
docker compose exec -T backup /restore.sh "$1"
docker compose start backend
echo "Restore complete."
