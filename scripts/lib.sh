# shellcheck shell=bash
# Helpers shared by start.sh and upgrade.sh (sourced, not run).

die() {
    echo "ERROR: $1" >&2
    shift
    for line in "$@"; do echo "  $line" >&2; done
    exit 1
}

# Read one KEY=value from .env (last one wins, as Compose does), without
# executing the file. Strips surrounding quotes and whitespace.
env_value() {
    local line
    [ -f .env ] || return 0
    line=$(grep -E "^$1=" .env | tail -n 1 || true)
    line=${line#*=}
    line=${line%$'\r'}
    line=${line#\"}; line=${line%\"}
    line=${line#\'}; line=${line%\'}
    printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

require_docker() {
    command -v docker >/dev/null 2>&1 || die "Docker isn't installed." \
        "Install Docker Engine or Docker Desktop: https://docs.docker.com/get-docker/"
    docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin (v2) isn't installed." \
        "DOCENT uses 'docker compose' (with a space), not the old 'docker-compose'." \
        "Install it: https://docs.docker.com/compose/install/"
    docker info >/dev/null 2>&1 || die "Can't talk to the Docker daemon." \
        "Is Docker running? If it is, your user may need to be in the 'docker' group:" \
        "  sudo usermod -aG docker \$USER   (then log out and back in)"
}

# The version this checkout would run: the tag if HEAD is tagged, else the
# short commit hash (empty outside a git checkout).
code_version() {
    git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || true
}

db_is_running() {
    [ -n "$(docker compose ps -q --status running db 2>/dev/null)" ]
}

# Run psql inside the db container; prints nothing on any failure.
db_query() {
    # shellcheck disable=SC2016  # expanded by the shell inside the container
    docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"' sh "$1" \
        2>/dev/null | tr -d '[:space:]' || true
}

# The schema revision the database is at (empty if there is no database yet).
db_revision() {
    db_query "SELECT version_num FROM alembic_version"
}

# The newest schema revision this checkout's code knows: the one migration
# that no other migration names as its predecessor.
code_head_revision() {
    local dir=backend/alembic/versions rev
    [ -d "$dir" ] || return 0
    # shellcheck disable=SC2013  # revision ids are single words
    for rev in $(sed -n -E "s/^revision(: *str)? *= *['\"]([^'\"]+)['\"].*/\2/p" "$dir"/*.py); do
        if ! grep -qE "^down_revision.*['\"]${rev}['\"]" "$dir"/*.py; then
            printf '%s' "$rev"
            return 0
        fi
    done
}

# The release a database at schema revision $1 most likely came from: the
# newest tag that has that migration but not the one after it. Empty when it
# can't be worked out (no git history, unknown revision).
release_for_revision() {
    local rev=$1 dir=backend/alembic/versions file next added next_added
    [ -n "$rev" ] || return 0
    file=$(grep -lE "^revision.*['\"]${rev}['\"]" "$dir"/*.py 2>/dev/null | head -n 1)
    [ -n "$file" ] || return 0
    added=$(git log --diff-filter=A --format=%H -- "$file" 2>/dev/null | tail -n 1)
    [ -n "$added" ] || return 0
    next=$(grep -lE "^down_revision.*['\"]${rev}['\"]" "$dir"/*.py 2>/dev/null | head -n 1)
    if [ -n "$next" ]; then
        next_added=$(git log --diff-filter=A --format=%H -- "$next" 2>/dev/null | tail -n 1)
    fi
    if [ -n "${next_added:-}" ]; then
        git tag --contains "$added" --no-contains "$next_added" 2>/dev/null
    else
        git tag --contains "$added" 2>/dev/null
    fi | grep -E '^v[0-9]' | sort -V | tail -n 1
}

# What is installed right now, as best we can tell: the version the running
# backend reports (releases since v0.1.9 know their own), else the release the
# database's schema belongs to.
installed_version() {
    local v
    v=$(docker compose exec -T backend printenv APP_VERSION 2>/dev/null | tr -d '[:space:]' || true)
    if [ -z "$v" ] || [ "$v" = dev ]; then
        v=$(release_for_revision "$(db_revision)")
    fi
    printf '%s' "$v"
}

UPGRADE_BACKUP_DIR=upgrade-backups
# shellcheck disable=SC2034  # used by the scripts that source this file
UPGRADE_STATE=$UPGRADE_BACKUP_DIR/last-upgrade

# Dump the whole database to a file on the host, straight from the db
# container — independent of the backup sidecar and of which DOCENT version
# is (or isn't) running. Prints the file's path.
dump_database() {  # label
    local stamp file
    stamp=$(date -u +%Y%m%d-%H%M%S)
    mkdir -p "$UPGRADE_BACKUP_DIR"
    chmod 700 "$UPGRADE_BACKUP_DIR"
    file="$UPGRADE_BACKUP_DIR/docent-${stamp}-before-${1:-upgrade}.dump"
    # shellcheck disable=SC2016  # expanded by the shell inside the container
    (umask 077 && docker compose exec -T db sh -c \
        'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$file.tmp") || {
        rm -f "$file.tmp"
        return 1
    }
    # An empty or truncated dump is worse than none: it looks like a safety net.
    if [ "$(head -c 5 "$file.tmp")" != PGDMP ]; then
        rm -f "$file.tmp"
        return 1
    fi
    mv "$file.tmp" "$file"
    # Keep the five most recent.
    # shellcheck disable=SC2012  # names are ours: no spaces or newlines
    ls -1 "$UPGRADE_BACKUP_DIR"/docent-*.dump 2>/dev/null | sort -r | tail -n +6 | while read -r old; do
        rm -f "$old"
    done
    printf '%s' "$file"
}

# Replace the database's contents with a dump made by dump_database.
restore_database() {  # file
    # Empty the schema first: restoring over a newer schema would leave its
    # extra tables behind, and a later upgrade would trip over them.
    # shellcheck disable=SC2016  # expanded by the shell inside the container
    docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "DROP SCHEMA public CASCADE" -c "CREATE SCHEMA public"' >/dev/null &&
    docker compose exec -T db sh -c \
        'pg_restore --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$1"
}
