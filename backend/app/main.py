from fastapi import FastAPI

from app.config import get_settings
from app.routers import admin, auth, map, reports, stats, users, venues, visits

INSECURE_SECRET = "dev-secret-do-not-use-in-production"

app = FastAPI(
    title="DOCENT API",
    description="Decentralized Outreach & Community Engagement Network Tracker",
    version="0.1.0",
)


@app.on_event("startup")
def _require_real_secret_key() -> None:
    # Refuse to start with the built-in default — otherwise session tokens are
    # forgeable. `scripts/start.sh` generates a strong SECRET_KEY automatically.
    if get_settings().secret_key == INSECURE_SECRET:
        raise RuntimeError(
            "SECRET_KEY is unset or the insecure default. Set a strong value "
            "in .env (openssl rand -hex 32)."
        )

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(venues.router)
app.include_router(visits.router)
app.include_router(stats.router)
app.include_router(admin.router)
app.include_router(map.router)
app.include_router(reports.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
