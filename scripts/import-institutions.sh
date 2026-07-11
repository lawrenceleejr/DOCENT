#!/usr/bin/env bash
# Import educational institutions from OpenStreetMap into the map catalog.
#   Usage: scripts/import-institutions.sh "<region>" [types] [extra flags]
#   e.g.:  scripts/import-institutions.sh "Tennessee"
#          scripts/import-institutions.sh "Tennessee" school,library --link-existing
#
# <region> is an OpenStreetMap admin area name (a US state, or any admin_level=4
# area). Types default to: school,college,museum,library.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -lt 1 ]; then
    echo 'Usage: scripts/import-institutions.sh "<region>" [types] [--link-existing] [--replace-region]' >&2
    exit 1
fi

region="$1"; shift
types="school,college,museum,library"
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then
    types="$1"; shift
fi

docker compose exec -T backend python -m app.scripts.import_institutions \
    --region "$region" --types "$types" "$@"
