#!/usr/bin/env bash
# Restart the running containers (no rebuild).
# To pick up new code, use scripts/start.sh instead (it rebuilds).
set -euo pipefail
cd "$(dirname "$0")/.."

# Include the bundled Caddy proxy in the restart when a domain is configured.
profile_args=()
if [ -f .env ] && grep -qE '^SITE_DOMAIN=[^[:space:]]+' .env; then
    profile_args=(--profile tls)
fi

docker compose ${profile_args[@]+"${profile_args[@]}"} restart
docker compose ${profile_args[@]+"${profile_args[@]}"} ps
