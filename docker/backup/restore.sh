#!/bin/bash
# Restore a dump produced by backup.sh.
#   Usage: restore.sh daily/docent-2026-07-09.dump
# Stop the backend first so nothing writes during the restore:
#   docker compose stop backend
#   docker compose exec backup /restore.sh daily/docent-2026-07-09.dump
#   docker compose start backend
set -euo pipefail

BACKUP_ROOT=${BACKUP_ROOT:-/backups}

if [ $# -ne 1 ]; then
    echo "Usage: restore.sh <path relative to $BACKUP_ROOT>" >&2
    echo "Available backups:" >&2
    find "$BACKUP_ROOT" -name '*.dump' | sort >&2
    exit 1
fi

file="$BACKUP_ROOT/$1"
if [ ! -f "$file" ]; then
    echo "No such backup: $file" >&2
    exit 1
fi

echo "[restore] restoring $file into $PGDATABASE"
pg_restore --clean --if-exists -d "$PGDATABASE" "$file"
echo "[restore] done"
