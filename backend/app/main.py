from fastapi import FastAPI

from app.routers import admin, auth, map, stats, users, venues, visits

app = FastAPI(
    title="DOCENT API",
    description="Decentralized Outreach & Community Engagement Network Tracker",
    version="0.1.0",
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(venues.router)
app.include_router(visits.router)
app.include_router(stats.router)
app.include_router(admin.router)
app.include_router(map.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
