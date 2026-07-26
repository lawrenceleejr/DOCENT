#!/bin/bash
# Backup scheduler: one dump per night at $BACKUP_HOUR:00 (container time, UTC),
# plus one immediately on first start so a fresh deployment is never unprotected.
set -u

BACKUP_HOUR=${BACKUP_HOUR:-02}
BACKUP_ROOT=${BACKUP_ROOT:-/backups}

if [ -z "$(find "$BACKUP_ROOT" -name '*.dump' 2>/dev/null | head -1)" ]; then
    echo "[run] no existing backups found — taking an initial one"
    /backup.sh || echo "[run] initial backup FAILED" >&2
fi

while true; do
    now=$(date +%s)
    target=$(date -d "today ${BACKUP_HOUR}:00" +%s)
    if [ "$target" -le "$now" ]; then
        target=$(date -d "tomorrow ${BACKUP_HOUR}:00" +%s)
    fi
    echo "[run] next scheduled backup at $(date -d "@$target" -Is)"
    # Poll until the scheduled time, honoring on-demand requests from the app:
    # a .run-now sentinel (take a backup) or a .restore-request sentinel whose
    # first line is the dump to restore — both dropped via the admin panel.
    while [ "$(date +%s)" -lt "$target" ]; do
        if [ -f "$BACKUP_ROOT/.restore-request" ]; then
            rel="$(head -n1 "$BACKUP_ROOT/.restore-request")"
            echo "[run] restore requested: $rel"
            rm -f "$BACKUP_ROOT/.restore-request"
            /restore.sh "$rel" || echo "[run] restore FAILED" >&2
        fi
        if [ -f "$BACKUP_ROOT/.run-now" ]; then
            echo "[run] on-demand backup requested"
            rm -f "$BACKUP_ROOT/.run-now"
            /backup.sh || echo "[run] on-demand backup FAILED" >&2
        fi
        sleep 5
    done
    /backup.sh || echo "[run] backup FAILED" >&2
done
