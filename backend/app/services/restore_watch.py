"""Bring a restored database up to this version's schema.

The backup sidecar does the actual restore. When the dump it restored came
from an older DOCENT — the usual case when moving to a new server, or going
back to last month's backup after several upgrades — the database is left at
that older schema while this (newer) code is running against it.

The migrations that fix that already run, with all their diagnostics, every
time the container starts. So rather than a second way of running them, this
watcher notices a finished restore whose schema isn't ours and exits the
process; Docker restarts the container and the normal startup path migrates.

It deliberately doesn't hang off an API request: after such a restore the
`users` table may predate columns the auth check reads, so no signed-in
request can be relied on to succeed until the migration has happened.
"""
import asyncio
import logging
import os
import signal
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

from app.database import engine

log = logging.getLogger("uvicorn.error")

BACKUP_ROOT = Path(os.environ.get("BACKUP_ROOT", "/backups"))
POLL_SECONDS = 5


def _head_revision() -> str | None:
    try:
        return ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()
    except Exception:  # noqa: BLE001 — no alembic.ini here (tests, odd cwd): nothing to do
        return None


def _database_revision() -> str | None:
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def _finished_restore() -> str | None:
    """Identity of the latest successful restore (its timestamp), else None."""
    try:
        fields = dict(
            line.split("=", 1)
            for line in (BACKUP_ROOT / ".restore-status").read_text().splitlines()
            if "=" in line
        )
    except OSError:
        return None
    return fields.get("at") if fields.get("state") == "success" else None


async def restore_watch_loop() -> None:
    head = _head_revision()
    if head is None or not BACKUP_ROOT.exists():
        return
    handled = _finished_restore()  # whatever finished before we started is done
    while True:
        await asyncio.sleep(POLL_SECONDS)
        finished = _finished_restore()
        if finished is None or finished == handled:
            continue
        handled = finished
        try:
            current = await asyncio.to_thread(_database_revision)
        except Exception:  # noqa: BLE001 — database briefly unavailable mid-restore
            handled = None  # look again next tick
            continue
        if current != head:
            log.warning(
                "A restored database is at schema revision %s; this version needs %s. "
                "Restarting to migrate it.",
                current,
                head,
            )
            os.kill(os.getpid(), signal.SIGTERM)
            return
