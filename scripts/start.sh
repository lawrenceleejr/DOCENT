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
    # Portable in-place edits (works on GNU and BSD sed).
    tmp=$(mktemp)
    sed -e "s|^SECRET_KEY=.*|SECRET_KEY=${secret}|" \
        -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${dbpass}|" \
        .env > "$tmp" && mv "$tmp" .env
    echo "  Generated SECRET_KEY and POSTGRES_PASSWORD."
    echo "  Review .env (HTTP_PORT, COOKIE_SECURE, INVITE_CODE) before going public."
fi

echo "Building and starting containers..."
docker compose up -d --build

echo
docker compose ps
port=$(grep -E '^HTTP_PORT=' .env | cut -d= -f2)
echo
echo "DOCENT is starting on port ${port:-80}."
echo "The FIRST account you register becomes the admin — do that now."
