#!/bin/bash
# Restore a pg_dump (-Fc) archive produced by backup.sh. Always takes a fresh
# "pre-restore" safety dump first, so a mistaken restore is recoverable (#29),
# and writes progress to $BACKUP_ROOT/.restore-status for the admin panel.
#
# App-triggered restores arrive through run.sh's sentinel; you can also run it
# by hand:
#   docker compose exec backup /restore.sh daily/docent-2026-07-09.dump
set -uo pipefail

BACKUP_ROOT=${BACKUP_ROOT:-/backups}
STATUS="$BACKUP_ROOT/.restore-status"
REL="${1:-}"

write_status() {  # state  detail
    {
        echo "state=$1"
        echo "at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "backup=$REL"
        echo "detail=$2"
    } > "$STATUS"
}
fail() { write_status failed "$1"; echo "[restore] FAILED: $1" >&2; exit 1; }

[ -n "$REL" ] || fail "no backup specified"
file="$BACKUP_ROOT/$REL"
[ -f "$file" ] || fail "no such backup: $REL"

write_status running "validating archive"
# Refuse to touch the live database with an archive pg_restore can't read.
pg_restore --list "$file" > /dev/null 2>&1 || fail "not a valid pg_dump archive"

# 1) Safety net: a fresh pre-restore dump before we overwrite anything.
write_status running "taking pre-restore backup"
mkdir -p "$BACKUP_ROOT/pre-restore"
safety="$BACKUP_ROOT/pre-restore/docent-pre-restore-$(date +%Y%m%d-%H%M%S).dump"
pg_dump -Fc -f "$safety.tmp" "$PGDATABASE" || fail "pre-restore backup failed"
pg_restore --list "$safety.tmp" > /dev/null || fail "pre-restore backup is unreadable"
mv "$safety.tmp" "$safety"
# Keep only the last 10 pre-restore dumps.
ls -1 "$BACKUP_ROOT/pre-restore" | sort | head -n -10 | while read -r old; do
    rm -f "$BACKUP_ROOT/pre-restore/$old"
done

# 2) Drop other connections so pg_restore --clean can drop/recreate tables
#    without blocking on the live backend's pooled connections.
write_status running "restoring database"
psql -d "$PGDATABASE" -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

# 3) Restore. --clean --if-exists drops existing objects first; --no-owner keeps
#    it portable across environments with different role names.
if pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" "$file" 2> /tmp/restore.err; then
    write_status success "Restored from $REL."
    echo "[restore] done"
else
    # pg_restore can exit non-zero on ignorable warnings; treat the restore as
    # successful only if the schema is actually usable afterwards.
    if psql -d "$PGDATABASE" -tAc "SELECT 1 FROM users LIMIT 1;" > /dev/null 2>&1; then
        write_status success "Restored from $REL (completed with warnings)."
        echo "[restore] done (with warnings)"
    else
        fail "pg_restore error: $(tail -c 300 /tmp/restore.err | tr '\n' ' ')"
    fi
fi
