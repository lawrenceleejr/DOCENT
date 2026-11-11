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

# --- Preflight: say what's missing before anything half-starts ---------------
die() {
    echo "ERROR: $1" >&2
    shift
    for line in "$@"; do echo "  $line" >&2; done
    exit 1
}

command -v docker >/dev/null 2>&1 || die "Docker isn't installed." \
    "Install Docker Engine or Docker Desktop: https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin (v2) isn't installed." \
    "DOCENT uses 'docker compose' (with a space), not the old 'docker-compose'." \
    "Install it: https://docs.docker.com/compose/install/"
docker info >/dev/null 2>&1 || die "Can't talk to the Docker daemon." \
    "Is Docker running? If it is, your user may need to be in the 'docker' group:" \
    "  sudo usermod -aG docker \$USER   (then log out and back in)"

random_hex() {  # bytes
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex "$1"
    else
        head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
    fi
}

# Read one KEY=value from .env (last one wins, as Compose does), without
# executing the file. Strips surrounding quotes and whitespace.
env_value() {
    local line
    line=$(grep -E "^$1=" .env | tail -n 1 || true)
    line=${line#*=}
    line=${line%$'\r'}
    line=${line#\"}; line=${line%\"}
    line=${line#\'}; line=${line%\'}
    printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
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
    exit 1
fi

echo
"${compose[@]}" ps
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
