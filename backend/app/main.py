# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import asyncio

from fastapi import FastAPI

from app.config import get_settings
from app.routers import (
    admin,
    auth,
    connections,
    federation,
    geocode,
    map,
    public,
    reports,
    stats,
    users,
    venues,
    visits,
)

INSECURE_SECRET = "dev-secret-do-not-use-in-production"

app = FastAPI(
    title="DOCENT API",
    description="Distributed Outreach & Community Engagement Network Tracker",
    version="0.1.0",
)


@app.on_event("startup")
def _require_real_secret_key() -> None:
    # Refuse to start with a weak/default SECRET_KEY — otherwise session tokens
    # are forgeable. `scripts/start.sh` generates a strong one automatically.
    secret = get_settings().secret_key
    if secret == INSECURE_SECRET or "change-me" in secret or len(secret) < 32:
        raise RuntimeError(
            "SECRET_KEY is unset, a placeholder, or too short. Set a strong "
            "value in .env (openssl rand -hex 32 gives a good 64-char key)."
        )


@app.on_event("startup")
async def _start_federation_scheduler() -> None:
    # Pull activities from sibling instances on their configured intervals.
    # Disabled under tests; a single background task guarded by an advisory lock.
    if get_settings().federation_sync_enabled:
        from app.scheduler import federation_sync_loop

        asyncio.create_task(federation_sync_loop())

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(venues.router)
app.include_router(connections.router)
app.include_router(geocode.router)
app.include_router(visits.router)
app.include_router(stats.router)
app.include_router(admin.router)
app.include_router(map.router)
app.include_router(reports.router)
app.include_router(public.router)
app.include_router(federation.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
