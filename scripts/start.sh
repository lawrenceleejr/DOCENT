#!/usr/bin/env bash
# Start (or update + start) the whole DOCENT stack.
# On first run this creates .env with secure random secrets.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
    echo "No .env found — creating one from .env.example with random secrets."
    cp .env.example .env
    secret=$(openssl rand -hex 32)
    dbpass=$(openssl rand -hex 16)
    invite=$(openssl rand -hex 4)
    # Portable in-place edits (works on GNU and BSD sed).
    tmp=$(mktemp)
    sed -e "s|^SECRET_KEY=.*|SECRET_KEY=${secret}|" \
        -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${dbpass}|" \
        -e "s|^INVITE_CODE=.*|INVITE_CODE=${invite}|" \
        .env > "$tmp" && mv "$tmp" .env
    echo "  Generated SECRET_KEY, POSTGRES_PASSWORD, and an access code."
    echo
    echo "  ACCESS CODE (required to register): ${invite}"
    echo "  Share this only with people you want to let in. Register the FIRST"
    echo "  account now — it becomes the admin."
    echo
    echo "  Set CONTACT_EMAIL in .env so people know who to ask for a code or a"
    echo "  password reset, then re-run this script."
fi

# Read the configured domain (blank on first run). When set, we also start the
# bundled Caddy HTTPS proxy via the "tls" compose profile; when blank we don't,
# so the app is reachable at http://localhost only.
domain=$(grep -E '^SITE_DOMAIN=' .env | cut -d= -f2- | tr -d '[:space:]')
profile_args=()
if [ -n "${domain}" ]; then
    profile_args=(--profile tls)
fi

echo "Building and starting containers..."
docker compose ${profile_args[@]+"${profile_args[@]}"} up -d --build

echo
docker compose ${profile_args[@]+"${profile_args[@]}"} ps
port=$(grep -E '^HTTP_PORT=' .env | cut -d= -f2)
echo
if [ -n "${domain}" ]; then
    echo "DOCENT is going live at https://${domain} (bundled Caddy is fetching a"
    echo "TLS certificate — this needs the domain's DNS pointing here and ports"
    echo "80 + 443 open). It's also on http://localhost:${port:-8080}."
else
    echo "DOCENT is running at http://localhost:${port:-8080}."
    echo "To publish it over HTTPS, set SITE_DOMAIN in .env and re-run this script."
fi
echo "The FIRST account you register becomes the admin — do that now."
