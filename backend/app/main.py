# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
import asyncio
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.routers import (
    admin,
    auth,
    connections,
    federation,
    geocode,
    imports,
    map,
    meta,
    public,
    reports,
    stats,
    users,
    venues,
    visits,
)

INSECURE_SECRET = "dev-secret-do-not-use-in-production"
INSECURE_POSTGRES_PASSWORD = "change-me"

def _require_real_secret_key() -> None:
    # Refuse to start with a weak/default SECRET_KEY — otherwise session tokens
    # are forgeable. `scripts/start.sh` generates a strong one automatically.
    secret = get_settings().secret_key
    if secret == INSECURE_SECRET or "change-me" in secret or len(secret) < 32:
        raise RuntimeError(
            "SECRET_KEY is unset, a placeholder, or too short. Set a strong "
            "value in .env (openssl rand -hex 32 gives a good 64-char key)."
        )


def _require_real_postgres_password() -> None:
    # Postgres will happily start with the '.env.example' placeholder password,
    # so a forgotten edit here would otherwise boot up successfully with a
    # well-known credential instead of failing loudly. `scripts/start.sh`
    # generates a strong one automatically.
    password = make_url(get_settings().database_url).password
    if password and INSECURE_POSTGRES_PASSWORD in password:
        raise RuntimeError(
            "POSTGRES_PASSWORD is still the '.env.example' placeholder "
            "('change-me'). Set a strong value in .env (openssl rand -hex 16 "
            "gives a good one), then recreate the containers."
        )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _require_real_secret_key()
    _require_real_postgres_password()
    # Pull activities from sibling instances on their configured intervals.
    # Disabled under tests; a single background task guarded by an advisory lock.
    sync_task = None
    if get_settings().federation_sync_enabled:
        from app.scheduler import federation_sync_loop

        sync_task = asyncio.create_task(federation_sync_loop())
    yield
    if sync_task is not None:
        sync_task.cancel()


app = FastAPI(
    title="DOCENT API",
    description="Distributed Outreach & Community Engagement Network Tracker",
    version="0.1.9",
    lifespan=lifespan,
)

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _is_cross_site(request: Request) -> bool:
    """True when a browser says this request was started by another site.

    The session cookie is SameSite=Lax, which already keeps it off cross-site
    POSTs. This is the second lock: Lax still counts sibling subdomains
    (other.your-org.edu) as the same site, and they could post a form here.
    Non-browser clients send neither header and pass through.
    """
    fetch_site = request.headers.get("sec-fetch-site")
    if fetch_site:
        # The browser's own verdict; "none" is a user-typed/bookmarked request.
        return fetch_site not in ("same-origin", "none")
    origin = request.headers.get("origin")
    if not origin or origin == "null":
        return bool(origin)
    origin_host = (urlsplit(origin).hostname or "").lower()
    # Compare hostnames only: nginx forwards Host without the port.
    ours = {
        (urlsplit(f"//{value}").hostname or "").lower()
        for value in (
            request.headers.get("host"),
            request.headers.get("x-forwarded-host"),
        )
        if value
    }
    return origin_host not in ours


@app.middleware("http")
async def reject_cross_site_writes(request: Request, call_next):
    if request.method in _UNSAFE_METHODS and _is_cross_site(request):
        return JSONResponse(
            status_code=403,
            content={"detail": "Cross-site request refused."},
        )
    return await call_next(request)


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(venues.router)
app.include_router(connections.router)
app.include_router(geocode.router)
app.include_router(visits.router)
app.include_router(imports.router)
app.include_router(stats.router)
app.include_router(admin.router)
app.include_router(map.router)
app.include_router(reports.router)
app.include_router(public.router)
app.include_router(federation.router)
app.include_router(meta.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
