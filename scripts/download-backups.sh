#!/usr/bin/env bash
# Copy all backups out of the Docker volume onto the host, so you can move them
# off-site. The volume lives on the same machine as the DB — keep copies elsewhere!
#   Usage: scripts/download-backups.sh [destination-dir]   (default: ./backups-export)
set -euo pipefail
cd "$(dirname "$0")/.."

dest="${1:-./backups-export}"
mkdir -p "$dest"
docker compose cp backup:/backups/. "$dest"
echo "Copied backups to: $dest"
