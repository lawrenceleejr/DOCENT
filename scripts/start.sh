#!/usr/bin/env bash
# Start (or update + start) the whole DOCENT stack.
# On first run this creates .env with secure random secrets.
#
#   ./scripts/start.sh             build from this checkout and start
#   ./scripts/start.sh --release   start the published images instead of building
set -euo pipefail
cd "$(dirname "$0")/.."

want_release=0
for arg in "$@"; do
    case "$arg" in
        --release) want_release=1 ;;
        -h|--help)
            echo "Usage: scripts/start.sh [--release]"
            echo "  (default)   build the images from this checkout and start"
            echo "  --release   pull and start the published release images (no build);"
            echo "              remembered in .env, so later runs and the other scripts follow"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg (try --help)" >&2
            exit 2
            ;;
    esac
done

# shellcheck source=scripts/lib.sh
. scripts/lib.sh

# --- Preflight: say what's missing before anything half-starts ---------------
require_docker

random_hex() {  # bytes
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex "$1"
    else
        head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
    fi
}

first_run=0
if [ ! -f .env ]; then
    first_run=1
    echo "No .env found — creating one from .env.example with random secrets."
    secret=$(random_hex 32)
    dbpass=$(random_hex 16)
    invite=$(random_hex 4)
    # Created private from the start: it holds the database and session secrets.
    # (Portable in-place edit — works with both GNU and BSD sed.)
    (umask 077 && sed -e "s|^SECRET_KEY=.*|SECRET_KEY=${secret}|" \
        -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${dbpass}|" \
        -e "s|^INVITE_CODE=.*|INVITE_CODE=${invite}|" \
        .env.example > .env)
    echo "  Generated SECRET_KEY, POSTGRES_PASSWORD, and an access code."
fi
chmod 600 .env 2>/dev/null || true

# Catch a hand-made .env that still has the placeholders — the backend refuses
# to start with them, which is much harder to diagnose from a restart loop.
case "$(env_value SECRET_KEY)" in
    ""|*change-me*) die "SECRET_KEY in .env is empty or still the placeholder." \
        "Set it to the output of:  openssl rand -hex 32" ;;
esac
case "$(env_value POSTGRES_PASSWORD)" in
    ""|*change-me*) die "POSTGRES_PASSWORD in .env is empty or still the placeholder." \
        "Set it to the output of:  openssl rand -hex 16" ;;
esac

# --release is remembered as COMPOSE_FILE in .env — a setting Docker Compose
# itself reads — so every later `docker compose` command and helper script
# uses the published images too. Remove that line to go back to building.
if [ "$want_release" -eq 1 ] && [ "$(env_value COMPOSE_FILE)" != docker-compose.release.yml ]; then
    printf '\n# Run the published release images instead of building from source.\nCOMPOSE_FILE=docker-compose.release.yml\n' >> .env
fi
compose_file=$(env_value COMPOSE_FILE)
compose_file=${compose_file:-docker-compose.yml}

# When a domain is configured we also start the bundled Caddy HTTPS proxy via
# the "tls" compose profile; when blank we don't, so the app is reachable at
# http://localhost only.
domain=$(env_value SITE_DOMAIN)
compose=(docker compose)
if [ -n "${domain}" ]; then
    compose+=(--profile tls)
fi

# --- Upgrade safety net ------------------------------------------------------
# Starting a newer DOCENT over an existing database runs its migrations, which
# only go forward. So whenever the database is behind this code — one release
# or ten — dump it to upgrade-backups/ first. `scripts/upgrade.sh --rollback`
# (or the two commands printed on failure) puts everything back.
upgrade_from="" upgrade_dump=""
if [ "$first_run" -eq 0 ]; then
    # The database may be stopped (stop.sh, a reboot); it only takes a moment
    # to bring up on its own, and it is the same image in every release.
    if ! db_is_running && docker volume inspect "$(docker compose config 2>/dev/null \
            | sed -n 's/^name: //p')_pgdata" >/dev/null 2>&1; then
        docker compose up -d db >/dev/null 2>&1 || true
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            [ -n "$(db_query 'SELECT 1')" ] && break
            sleep 2
        done
    fi
    current_rev=$(db_revision)
    head_rev=$(code_head_revision)
    # upgrade.sh asks for a copy on every version change, so that --rollback
    # always has one to return to, even when no migration is pending.
    if [ -n "$current_rev" ] && { [ -n "${DOCENT_UPGRADE_FROM_COMMIT:-}" ] ||
        { [ -n "$head_rev" ] && [ "$current_rev" != "$head_rev" ]; }; }; then
        upgrade_from=${DOCENT_UPGRADE_FROM_VERSION:-$(installed_version)}
        if [ "$current_rev" != "$head_rev" ]; then
            echo "This is an upgrade${upgrade_from:+ from ${upgrade_from}}: the database needs migrating."
        else
            echo "This is an upgrade${upgrade_from:+ from ${upgrade_from}}."
        fi
        echo "Saving a copy of the database first..."
        if upgrade_dump=$(dump_database "$(code_version)"); then
            echo "  Saved: ${upgrade_dump}"
            {
                echo "from_version=${upgrade_from}"
                echo "from_commit=${DOCENT_UPGRADE_FROM_COMMIT:-}"
                echo "to_version=$(code_version)"
                echo "dump=${upgrade_dump}"
                echo "at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
            } > "$UPGRADE_STATE"
        else
            die "Couldn't back up the database, so the upgrade was not started." \
                "Nothing has been changed. Check that the db container is healthy" \
                "(docker compose ps; docker compose logs db) and re-run this script."
        fi
    fi
fi

# Releases before v0.1.3 kept backups in a Docker volume; they now live in a
# normal folder (BACKUP_DIR). Bring the old ones along so they aren't stranded.
legacy_volume="$(docker compose config 2>/dev/null | sed -n 's/^name: //p')_backups"
backup_dir=$(env_value BACKUP_DIR)
backup_dir=${backup_dir:-./backups}
if docker volume inspect "$legacy_volume" >/dev/null 2>&1 && [ ! -e "$backup_dir/.legacy-volume-copied" ]; then
    echo "Copying backups from the old Docker volume ($legacy_volume) into $backup_dir..."
    mkdir -p "$backup_dir" 2>/dev/null || true
    if docker run --rm -v "$legacy_volume":/from:ro -v "$(cd "$backup_dir" && pwd)":/to postgres:16 \
            sh -c 'cp -a -n /from/. /to/ && touch /to/.legacy-volume-copied' >/dev/null 2>&1; then
        echo "  Done. The old volume is no longer used; remove it when you like:"
        echo "    docker volume rm $legacy_volume"
    else
        echo "  Couldn't copy them automatically; they are still safe in that volume." >&2
    fi
fi

if [ "$compose_file" != docker-compose.release.yml ]; then
    # Stamp the footer with the current git version — the tag if this commit is
    # tagged, else the short hash — so it survives into the container build (#26).
    # (The build context has no .git, so vite.config.ts reads this instead.)
    VITE_APP_VERSION="$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || true)"
    export VITE_APP_VERSION
    echo "Building and starting containers (the first build takes a few minutes)..."
    up_args=(up -d --build)
else
    echo "Pulling and starting the published images..."
    "${compose[@]}" pull
    up_args=(up -d)
fi

# `up` waits for the database and the API to report healthy (migrations run
# first), so a failure here is a real one — show why instead of a bare exit.
if ! "${compose[@]}" "${up_args[@]}"; then
    echo >&2
    echo "DOCENT did not start cleanly. The backend's last log lines:" >&2
    "${compose[@]}" logs --tail 40 backend >&2 || true
    echo >&2
    echo "Full logs:  ${compose[*]} logs backend" >&2
    if [ -n "$upgrade_dump" ]; then
        echo >&2
        echo "Your data is safe: the database was saved before the upgrade began, in" >&2
        echo "  ${upgrade_dump}" >&2
        echo "To go back to ${upgrade_from:-the version you had}, run:" >&2
        echo "  ./scripts/upgrade.sh --rollback" >&2
    fi
    exit 1
fi

echo
"${compose[@]}" ps
if [ -n "$upgrade_dump" ]; then
    echo
    echo "Upgraded${upgrade_from:+ from ${upgrade_from}} to $(code_version)."
    echo "The database as it was before is in ${upgrade_dump}"
    echo "(undo with ./scripts/upgrade.sh --rollback)."
fi
port=$(env_value HTTP_PORT)
port=${port:-8080}
bind=$(env_value BIND_HOST)
echo
if [ -n "${domain}" ]; then
    echo "DOCENT is going live at https://${domain} (bundled Caddy is fetching a"
    echo "TLS certificate — this needs the domain's DNS pointing here and ports"
    echo "80 + 443 open). It's also on http://localhost:${port}."
else
    echo "DOCENT is running at http://localhost:${port}."
    if [ -z "${bind}" ] || [ "${bind}" = "127.0.0.1" ]; then
        echo "It is reachable from this machine only. To publish it over HTTPS, set"
        echo "SITE_DOMAIN in .env and re-run this script."
    fi
fi

# Until someone has registered, keep the access code in front of the person
# installing — the first account becomes the admin. (Asked of the database so a
# re-run after a failed first attempt still shows it.)
# shellcheck disable=SC2016  # expanded by the shell inside the container
users=$("${compose[@]}" exec -T db sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM users"' 2>/dev/null \
    | tr -d '[:space:]' || true)
invite=$(env_value INVITE_CODE)
if [ "${users:-}" = "0" ]; then
    echo
    echo "  NEXT STEP: open the address above and register."
    echo "  The FIRST account becomes the admin — do it now, before sharing the code."
    if [ -n "${invite}" ]; then
        echo
        echo "      ACCESS CODE: ${invite}"
        echo
        echo "  Everyone needs this code to register. You can change it later under"
        echo "  Admin → Registration."
    else
        echo "  INVITE_CODE in .env is empty, so registration is closed. Set one"
        echo "  (any phrase you choose) and re-run this script."
    fi
elif [ "$first_run" -eq 1 ] && [ -n "${invite}" ]; then
    echo
    echo "  ACCESS CODE (required to register): ${invite}"
fi
if [ -z "$(env_value CONTACT_EMAIL)" ] && [ "${users:-}" = "0" ]; then
    echo
    echo "  Tip: set a contact email under Admin → Registration (or CONTACT_EMAIL in"
    echo "  .env) so people know who to ask for the access code or a password reset."
fi
