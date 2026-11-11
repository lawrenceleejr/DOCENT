# shellcheck shell=bash
# Shared preamble for the backup scripts (sourced, not run).
#
# Each script may be started as root — by Docker for run.sh, or by an admin
# using `docker compose exec backup /backup.sh`. Root is used only to hand the
# backups folder to the unprivileged `docent` user; the script then re-runs
# itself as that user, so every dump is created private (0600, in a 0700
# folder) instead of world-readable on the host.
BACKUP_ROOT=${BACKUP_ROOT:-/backups}

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$BACKUP_ROOT"
    chown -R docent:docent "$BACKUP_ROOT"
    chmod 700 "$BACKUP_ROOT"
    find "$BACKUP_ROOT" -type f -name '*.dump' -exec chmod 600 {} +
    exec gosu docent "$0" "$@"
fi
umask 077
