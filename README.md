# DOCENT

**D**ecentralized **O**utreach & **C**ommunity **E**ngagement **N**etwork **T**racker — a self-hosted web app for scientific communities to track outreach efforts: visits to grade schools, community colleges, museums, libraries, and beyond.

Researchers register accounts and log each visit — venue, date, contact person, audience, how it went, people reached — and the whole community shares a live **Analysis** dashboard: events over time, people reached, breakdowns by venue type and audience, top venues, and a researcher leaderboard. Visit data exports to CSV for grant reporting.

**Stack:** FastAPI + PostgreSQL backend, React (TypeScript, Mantine, Recharts) frontend, nginx, and a backup sidecar with nightly rotated `pg_dump`s — all deployed with a single `docker compose up`.

---

## Quickstart (production)

Requirements: Docker with the Compose plugin.

```bash
git clone <this-repo> && cd DOCENT
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and SECRET_KEY (openssl rand -hex 32)
docker compose up -d --build
```

Open `http://your-server/` (port set by `HTTP_PORT`, default 80). **The first account registered automatically becomes the admin** — register yourself immediately after deploying.

DOCENT serves plain HTTP; for anything internet-facing put your usual TLS reverse proxy (Caddy, Traefik, nginx) in front and keep `COOKIE_SECURE=true`.

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` | `docent` | Database name / user |
| `POSTGRES_PASSWORD` | — (required) | Database password |
| `SECRET_KEY` | — (required) | JWT signing key — `openssl rand -hex 32` |
| `INVITE_CODE` | empty | If set, registration requires this code; empty = open signup |
| `ACCESS_TOKEN_DAYS` | `7` | Login session lifetime |
| `COOKIE_SECURE` | `true` | Set `false` only when serving over plain http |
| `HTTP_PORT` | `80` | Host port for the web UI |
| `BACKUP_HOUR` | `02` | Hour (UTC, 00–23) of the nightly backup |

Changes to `.env` take effect with `docker compose up -d`.

## Backups

The `backup` service dumps the database every night at `BACKUP_HOUR:00` UTC into the `backups` Docker volume, verifies each dump with `pg_restore --list`, and rotates:

| Tier | Kept | Created |
|---|---|---|
| `daily/` | 7 | every night (plus once on first startup) |
| `weekly/` | 4 | hardlinked each Sunday |
| `monthly/` | 12 | hardlinked on the 1st |

```bash
# Take a manual backup right now
docker compose exec backup /backup.sh

# List backups
docker compose exec backup find /backups -name '*.dump' | sort

# Copy a backup off the server (do this regularly — the volume lives on the same host!)
docker compose cp backup:/backups/daily/docent-2026-07-10.dump .
```

### Restore

```bash
docker compose stop backend                                   # stop writes
docker compose exec backup /restore.sh daily/docent-2026-07-10.dump
docker compose start backend
```

Test your restore path periodically: create a throwaway visit, back up, delete it, restore, confirm it's back.

> **Postgres upgrades:** the `db` and `backup` images are both pinned to `postgres:16` so `pg_dump` always matches the server. Bump them together, and take a final backup on the old version first.

## Development

Backend and frontend run locally with hot reload against a containerized Postgres:

```bash
docker compose -f docker-compose.dev.yml up -d        # Postgres on localhost:5432

cd backend
python3 -m venv .venv && .venv/bin/pip install -e '.[test]'
DATABASE_URL=postgresql+psycopg://docent:docent@localhost:5432/docent \
COOKIE_SECURE=false .venv/bin/uvicorn app.main:app --reload   # api on :8000

cd frontend
npm install
npm run dev                                            # UI on :5173, proxies /api → :8000
```

API docs (Swagger) are served at `/docs` when running the backend directly.

Schema changes: edit `backend/app/models.py`, then
`cd backend && .venv/bin/alembic revision --autogenerate -m "describe change"` — migrations run automatically on backend startup.

### Tests

```bash
docker compose -f docker-compose.dev.yml up -d
cd backend && .venv/bin/pytest
```

The suite runs against real Postgres (the stats SQL uses `date_trunc` and native enums — don't swap in SQLite).

> **Building behind a TLS-inspecting proxy?** Drop the proxy's PEM bundle at `backend/extra-ca.crt` and `frontend/extra-ca.crt` (both gitignored) and the Docker builds will trust it.

## How it works

- **Accounts** — open self-registration (optionally gated by `INVITE_CODE`); the first account becomes admin. Admins manage users on the Admin tab.
- **Visibility** — every signed-in user sees all visits and the shared dashboard; only the visit's author (or an admin) can edit or delete it.
- **Venues are shared** — the visit form's venue picker searches existing venues first ("Name — City (type)") so the community builds one clean venue list instead of duplicates.
- **Auth** — JWT in an httpOnly `SameSite=Lax` cookie; the browser and API are same-origin through nginx (prod) / the Vite proxy (dev), so there's no CORS surface.

### Architecture

```
                        ┌─────────────┐
   browser ── :80 ────► │  frontend    │  nginx: serves the React build,
                        │  (nginx)     │  proxies /api/* to the backend
                        └──────┬──────┘
                               │ /api
                        ┌──────▼──────┐        ┌──────────┐
                        │  backend     │ ─────► │    db     │  postgres:16
                        │  (FastAPI)   │        │           │  volume: pgdata
                        └─────────────┘        └────▲─────┘
                                                    │ pg_dump nightly
                                               ┌────┴─────┐
                                               │  backup   │  volume: backups
                                               └──────────┘
```

## Deployment verification checklist

After deploying (or upgrading), confirm:

1. `docker compose ps` — all four services up, `db`/`backend` healthy.
2. Register a user; if it's the first user, check the Admin tab appears.
3. Log a visit (create the venue inline), see it on the Visits list, edit it.
4. Analysis tab shows tiles and charts.
5. Export CSV from the Visits page and open it.
6. `docker compose exec backup /backup.sh` — a dump appears under `/backups/daily/`.
7. Run through the restore steps above with a throwaway change.
