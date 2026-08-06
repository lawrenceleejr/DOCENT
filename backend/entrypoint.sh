#!/bin/sh
set -e

echo "Waiting for database..."
python - <<'PY'
import sys
import time

from sqlalchemy import create_engine, text

from app.config import get_settings

engine = create_engine(get_settings().database_url)
for attempt in range(30):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        sys.exit(0)
    except Exception:
        time.sleep(2)
print("Database never became ready", file=sys.stderr)
sys.exit(1)
PY

echo "Running migrations..."
# Self-diagnosing wrapper: preflights the revision, applies migrations one
# committed step at a time, and on failure prints an ordered recovery plan
# instead of leaving only a traceback.
python -m app.scripts.upgrade_db

echo "Starting API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
