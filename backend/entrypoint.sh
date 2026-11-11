#!/bin/sh
set -e

# The container starts as root only to make the shared backups folder usable,
# then drops to the unprivileged `docent` user for everything else — the
# migrations and the API itself never run as root.
if [ "$(id -u)" = "0" ]; then
    if [ -d /backups ]; then
        # Dumps hold the whole database; keep them private to the service user
        # rather than world-readable on the host.
        chown docent:docent /backups 2>/dev/null || true
        chmod 700 /backups 2>/dev/null || true
    fi
    exec setpriv --reuid=docent --regid=docent --init-groups "$0" "$@"
fi

echo "Waiting for database..."
python - <<'PY'
import sys
import time

from sqlalchemy import create_engine, text

from app.config import get_settings

engine = create_engine(get_settings().database_url)
last_error = None
for attempt in range(30):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001 — report whatever the driver says
        last_error = exc
        time.sleep(2)
# Say why: a wrong password and an unreachable host need different fixes.
reason = str(last_error).strip().splitlines()[0] if last_error else "unknown error"
print(f"Database never became ready: {reason}", file=sys.stderr)
if "password authentication failed" in str(last_error):
    print(
        "The database rejected the password. POSTGRES_PASSWORD in .env only takes\n"
        "effect when the database volume is first created; if you changed it\n"
        "afterwards, put the original value back (or change the role's password\n"
        "inside Postgres to match).",
        file=sys.stderr,
    )
sys.exit(1)
PY

echo "Running migrations..."
# Self-diagnosing wrapper: preflights the revision, applies migrations one
# committed step at a time, and on failure prints an ordered recovery plan
# instead of leaving only a traceback.
python -m app.scripts.upgrade_db

echo "Starting API..."
# Only the bundled nginx talks to this port, so its forwarding headers are the
# ones to believe (scheme for the cookie's Secure flag, client address for logs).
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'
