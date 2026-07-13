#!/usr/bin/env bash
# Fill a running DOCENT with a realistic demo dataset (fictional communicators,
# venues, visits, schedule, tags, coverage links). Safe to re-run — records are
# merge-imported by natural key and never duplicated.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose exec backend python -m app.scripts.seed_demo
