"""Self-diagnosing database upgrade, run by the container entrypoint.

Wraps `alembic upgrade head` with a preflight and, on failure, prints an
ordered, copy-pasteable recovery plan for the admin instead of leaving only a
traceback in a crash-looping container. Migrations commit one at a time
(transaction_per_migration in alembic/env.py), so a failure parks the database
at the last good revision and a rerun resumes from there.

Usage: python -m app.scripts.upgrade_db
"""
import sys

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine

from alembic import command
from app.config import get_settings


def _current_revision(engine) -> str | None:
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def _known_revision(script: ScriptDirectory, revision: str) -> bool:
    try:
        return script.get_revision(revision) is not None
    except Exception:  # noqa: BLE001 — alembic raises several types for "no such revision"
        return False


def main() -> int:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
    script = ScriptDirectory.from_config(cfg)
    head = script.get_current_head()
    engine = create_engine(get_settings().database_url)

    current = _current_revision(engine)
    if current == head:
        print(f"Database is up to date (revision {head}).")
        return 0

    # A revision this code has never heard of means the database was last
    # opened by a NEWER DOCENT (a rollback of the code without the data, or an
    # old image pointed at a new database). Migrations only go forward, so
    # there is nothing safe to run — say so instead of dying with a traceback.
    if current is not None and not _known_revision(script, current):
        print(
            "\n" + "=" * 72
            + "\nTHIS DATABASE IS FROM A NEWER VERSION OF DOCENT."
            + f"\n\n  Database revision: {current} (unknown to this version)"
            + f"\n  This version's newest revision: {head}"
            + "\n\nThe app will not start, and nothing has been changed. Either:"
            + "\n\n  • Run the newer version again (the usual fix):"
            + "\n       ./scripts/upgrade.sh"
            + "\n  • Or, to really go back to this older version, restore a database"
            + "\n    copy made by it — after an upgrade, this does both steps:"
            + "\n       ./scripts/upgrade.sh --rollback"
            + "\n" + "=" * 72,
            file=sys.stderr,
        )
        return 1

    pending = [s.revision for s in script.iterate_revisions(head, current)]
    pending.reverse()  # oldest first — the order they will apply in
    print(
        f"Database at revision {current or '<empty>'}; head is {head}. "
        f"Applying {len(pending)} migration(s): {', '.join(pending)}"
    )

    try:
        command.upgrade(cfg, "head")
        print(f"Database upgraded to {head}.")
        return 0
    except Exception as exc:  # noqa: BLE001 — anything alembic raises ends up here
        after = _current_revision(engine)
        # Which pending revisions made it in before the failure?
        done = []
        remaining = list(pending)
        if after != current:
            for rev in pending:
                done.append(rev)
                remaining.pop(0)
                if rev == after:
                    break
        failing = remaining[0] if remaining else "<unknown>"
        print(
            "\n" + "=" * 72
            + "\nDATABASE UPGRADE FAILED — the app will not start until this is fixed."
            + f"\n\n  Error: {exc}"
            + f"\n  Database is parked at revision: {after or '<empty>'}"
            + (f"\n  Applied before the failure: {', '.join(done)}" if done else "")
            + f"\n  Failed migration: {failing}"
            + (f"\n  Still pending: {', '.join(remaining)}" if remaining else "")
            + "\n\nTo recover, run these steps from the compose project directory:"
            + "\n\n  1. Inspect the error above; if it is a data problem, fix the data"
            + "\n     (the database is intact at the parked revision)."
            + "\n  2. Re-run the upgrade — it resumes from the parked revision:"
            + "\n       docker compose run --rm --entrypoint alembic backend upgrade head"
            + "\n  3. Verify, then start the backend:"
            + "\n       docker compose run --rm --entrypoint alembic backend current"
            + "\n       docker compose up -d backend"
            + "\n\nEach migration commits on its own, so rerunning never re-applies"
            + "\nfinished steps. If the same migration keeps failing, report the error"
            + "\nat https://github.com/lawrenceleejr/DOCENT/issues with the log above."
            + "\n" + "=" * 72
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
