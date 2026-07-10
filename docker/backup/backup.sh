#!/bin/bash
# Nightly pg_dump with daily/weekly/monthly rotation.
#   /backups/daily/    keeps the last 7
#   /backups/weekly/   keeps the last 4  (hardlinked on Sundays)
#   /backups/monthly/  keeps the last 12 (hardlinked on the 1st)
set -euo pipefail

BACKUP_ROOT=${BACKUP_ROOT:-/backups}
KEEP_DAILY=${KEEP_DAILY:-7}
KEEP_WEEKLY=${KEEP_WEEKLY:-4}
KEEP_MONTHLY=${KEEP_MONTHLY:-12}

today=$(date +%F)
mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" "$BACKUP_ROOT/monthly"

daily="$BACKUP_ROOT/daily/docent-$today.dump"
tmp="$daily.tmp"

echo "[backup] dumping $PGDATABASE to $daily"
pg_dump -Fc -f "$tmp" "$PGDATABASE"

# Refuse to keep a dump pg_restore can't read.
pg_restore --list "$tmp" > /dev/null
mv "$tmp" "$daily"

# Hardlink into the slower tiers (no extra disk until the daily copy rotates out).
if [ "$(date +%u)" = "7" ]; then
    ln -f "$daily" "$BACKUP_ROOT/weekly/docent-$today.dump"
fi
if [ "$(date +%d)" = "01" ]; then
    ln -f "$daily" "$BACKUP_ROOT/monthly/docent-$today.dump"
fi

prune() {
    dir=$1 keep=$2
    ls -1 "$dir" | sort | head -n -"$keep" | while read -r old; do
        echo "[backup] pruning $dir/$old"
        rm -f "$dir/$old"
    done
}
prune "$BACKUP_ROOT/daily" "$KEEP_DAILY"
prune "$BACKUP_ROOT/weekly" "$KEEP_WEEKLY"
prune "$BACKUP_ROOT/monthly" "$KEEP_MONTHLY"

echo "[backup] done: $(du -h "$daily" | cut -f1) written"
