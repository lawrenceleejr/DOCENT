#!/usr/bin/env bash
# Copy all backups to another folder you can read, so you can move them
# off-site. (The live backups folder is private to the DOCENT service user.)
# Backups live on the same machine as the database — keep copies elsewhere, and
# keep them encrypted: each dump is the entire database.
#   Usage: scripts/download-backups.sh [destination-dir]   (default: ./backups-export)
set -euo pipefail
cd "$(dirname "$0")/.."

dest="${1:-./backups-export}"
mkdir -p "$dest"
docker compose cp backup:/backups/. "$dest"
chmod -R go-rwx "$dest" 2>/dev/null || true
echo "Copied backups to: $dest"
