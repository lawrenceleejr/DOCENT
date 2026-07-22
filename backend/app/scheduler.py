# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""In-process periodic federation sync (a single background asyncio task).

Guarded by a Postgres session-level advisory lock on a dedicated connection so
that even if the app is ever run with multiple workers, only one runs the loop.
"""
import asyncio
import logging
from datetime import datetime, timezone

import anyio

from app.database import SessionLocal, engine
from app.services.federation import due_peers, sync_peer

logger = logging.getLogger("docent.federation")

SYNC_TICK_SECONDS = 60
# Arbitrary constant, unique to the federation sync loop.
ADVISORY_LOCK_KEY = 48231


def _run_due_syncs() -> None:
    """Sync every peer that's due, holding an advisory lock for the duration."""
    lock_conn = engine.raw_connection()
    try:
        cur = lock_conn.cursor()
        cur.execute("SELECT pg_try_advisory_lock(%s)", (ADVISORY_LOCK_KEY,))
        if not cur.fetchone()[0]:
            return  # another worker holds the lock
        try:
            db = SessionLocal()
            try:
                now = datetime.now(timezone.utc)
                for peer in due_peers(db, now):
                    sync_peer(db, peer, now)  # records status, never raises
            finally:
                db.close()
        finally:
            cur.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_KEY,))
            lock_conn.commit()
    finally:
        lock_conn.close()


async def federation_sync_loop() -> None:
    """Wake periodically and sync peers that are due. Runs forever."""
    while True:
        try:
            await anyio.to_thread.run_sync(_run_due_syncs)
        except Exception:  # noqa: BLE001 — keep the loop alive
            logger.exception("federation sync tick failed")
        await asyncio.sleep(SYNC_TICK_SECONDS)
