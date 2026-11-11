#!/usr/bin/env bash
# Stop the DOCENT stack. The database volume and the backups folder are kept.
set -euo pipefail
cd "$(dirname "$0")/.."

# Name the tls profile too, so the bundled Caddy proxy (if running) stops as well.
docker compose --profile tls down
echo "Stopped. Your data is kept — run scripts/start.sh to bring it back."
