#!/usr/bin/env bash
# Rebuild and restart the DOCENT stack so a `git pull` actually takes effect.
# By default this rebuilds the images (like start.sh) — the natural
#   git pull && ./scripts/restart.sh
# flow now deploys the new code instead of bouncing the old build.
#
# Use --no-build (alias --fast) for a quick container bounce with no rebuild
# when you only need to restart the running images (config reload, unstick a
# hung container) and haven't changed any source.
set -euo pipefail
cd "$(dirname "$0")/.."

build=1
for arg in "$@"; do
    case "$arg" in
        --no-build|--fast) build=0 ;;
        -h|--help)
            echo "Usage: scripts/restart.sh [--no-build|--fast]"
            echo "  (default)      rebuild images and restart (picks up pulled code)"
            echo "  --no-build     just bounce the running containers, no rebuild"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg (try --help)" >&2
            exit 2
            ;;
    esac
done

# Include the bundled Caddy proxy when a domain is configured (matches start.sh).
profile_args=()
if [ -f .env ] && grep -qE '^SITE_DOMAIN=[^[:space:]]+' .env; then
    profile_args=(--profile tls)
fi

if [ "$build" -eq 1 ]; then
    # Stamp the footer with the current git version — the tag if this commit is
    # tagged, else the short hash — so it survives into the container build (#26).
    # (The build context has no .git, so vite.config.ts reads this instead.) The
    # quick-bounce path skips this because it doesn't rebuild the image.
    export VITE_APP_VERSION="$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || true)"
    echo "Rebuilding and restarting containers..."
    docker compose ${profile_args[@]+"${profile_args[@]}"} up -d --build
else
    echo "Restarting containers (no rebuild)..."
    docker compose ${profile_args[@]+"${profile_args[@]}"} restart
fi

docker compose ${profile_args[@]+"${profile_args[@]}"} ps
