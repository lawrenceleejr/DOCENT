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

echo "Building and starting containers..."
docker compose up -d --build

echo
docker compose ps
port=$(grep -E '^HTTP_PORT=' .env | cut -d= -f2)
echo
echo "DOCENT is starting on port ${port:-80}."
echo "The FIRST account you register becomes the admin — do that now."
