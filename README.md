# DOCENT

**D**ecentralized **O**utreach & **C**ommunity **E**ngagement **N**etwork **T**racker — a self-hosted web app for scientific communities to track outreach efforts: visits to grade schools, community colleges, museums, libraries, and beyond.

Researchers register accounts and log each visit — venue, date, contact person, audience, how it went, people reached — and the whole community shares a live **Analysis** dashboard: events over time, people reached, breakdowns by venue type and audience, top venues, and a researcher leaderboard. Visit data exports to CSV for grant reporting.

**Stack:** FastAPI + PostgreSQL backend, React (TypeScript, Mantine, Recharts) frontend, nginx, and a backup sidecar with nightly rotated `pg_dump`s — all deployed with a single `docker compose up`.

---

## Getting started

For a machine that already runs Docker and where you want a subdomain
(e.g. `docent.example.org`) to serve DOCENT over HTTPS.

**1. Get the code and start it**

```bash
git clone <this-repo> && cd DOCENT
./scripts/start.sh
```

On first run `start.sh` creates `.env` with a random `SECRET_KEY` and
`POSTGRES_PASSWORD`, builds the images, and starts everything. DOCENT now
listens on `http://127.0.0.1:8080` (change with `HTTP_PORT` in `.env`).

**2. Point your subdomain at it**

- Add a DNS **A record** for `docent.example.org` → your server's public IP.
- Put a TLS reverse proxy in front so the subdomain serves HTTPS and forwards
  to DOCENT's port. [Caddy](https://caddyserver.com) is the least effort — it
  gets certificates automatically. A complete `Caddyfile`:

  ```caddy
  docent.example.org {
      reverse_proxy 127.0.0.1:8080
  }
  ```

  <details><summary>nginx equivalent (you provide the TLS certs)</summary>

  ```nginx
  server {
      listen 443 ssl;
      server_name docent.example.org;
      ssl_certificate     /etc/letsencrypt/live/docent.example.org/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/docent.example.org/privkey.pem;
      location / {
          proxy_pass http://127.0.0.1:8080;
          proxy_set_header Host $host;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
  ```
  </details>

Keep `COOKIE_SECURE=true` (the default) since the subdomain serves HTTPS. Only
set it `false` if you're testing over plain `http://`.

**3. Create the admin account**

Open `https://docent.example.org` and register. **The first account registered
automatically becomes the admin.** To keep the public out, set `INVITE_CODE` in
`.env` and re-run `./scripts/start.sh`.

### Helper scripts

Run from the repo root:

| Script | What it does |
|---|---|
| `./scripts/start.sh` | Build + start everything (creates `.env` with random secrets on first run). Also the way to **deploy updates** after `git pull`. |
| `./scripts/stop.sh` | Stop the stack (data volumes preserved). |
| `./scripts/restart.sh` | Restart the running containers (no rebuild). |
| `./scripts/backup.sh` | Take a database backup right now. |
| `./scripts/list-backups.sh` | List backups held in the volume. |
| `./scripts/download-backups.sh [dir]` | Copy all backups onto the host (for off-site storage). |
| `./scripts/restore.sh <file>` | Restore the DB from a backup (stops/starts the backend around it). |

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` | `docent` | Database name / user |
| `POSTGRES_PASSWORD` | — (required) | Database password |
| `SECRET_KEY` | — (required) | JWT signing key — `openssl rand -hex 32` |
| `INVITE_CODE` | empty | If set, registration requires this code; empty = open signup |
| `ACCESS_TOKEN_DAYS` | `7` | Login session lifetime |
| `COOKIE_SECURE` | `true` | Set `false` only when serving over plain http |
| `HTTP_PORT` | `8080` | Host port for the web UI (reverse-proxy forwards here) |
| `BACKUP_HOUR` | `02` | Hour (UTC, 00–23) of the nightly backup |
| `OVERPASS_URL` | overpass-api.de | OpenStreetMap Overpass endpoint used by the institution importer |

Changes to `.env` take effect after `./scripts/start.sh` (or `docker compose up -d`).

## Backups

The `backup` service dumps the database every night at `BACKUP_HOUR:00` UTC into the `backups` Docker volume, verifies each dump with `pg_restore --list`, and rotates:

| Tier | Kept | Created |
|---|---|---|
| `daily/` | 7 | every night (plus once on first startup) |
| `weekly/` | 4 | hardlinked each Sunday |
| `monthly/` | 12 | hardlinked on the 1st |

Use the helper scripts (they wrap the `backup` container):

```bash
./scripts/backup.sh                 # take a backup right now
./scripts/list-backups.sh           # see what's stored
./scripts/download-backups.sh ~/docent-backups   # copy off-site (do this regularly!)
```

### Restore

```bash
./scripts/list-backups.sh           # find the dump you want
./scripts/restore.sh daily/docent-2026-07-10.dump
```

`restore.sh` asks for confirmation, stops the backend during the restore, and
restarts it afterward. Test your restore path periodically: create a throwaway
visit, back up, delete it, restore, confirm it's back.

> **Postgres upgrades:** the `db` and `backup` images are both pinned to `postgres:16` so `pg_dump` always matches the server. Bump them together, and take a final backup on the old version first.

## Scheduling & calendar

Every visit has a **status**: *planned* (a scheduled future event) or *completed*
(outreach that happened). Only completed visits count toward the dashboard and
map coverage, so planning ahead never inflates your impact numbers.

- **Schedule** tab: your upcoming planned events, soonest first. "Schedule an
  event" opens the visit form in planned mode (attendance is optional); each row
  has "Mark done" to record what happened.
- The visit form has a **Planned / Completed** toggle and an optional **start
  time** (+ duration). A gap's "Log a visit here" on the map still works the same.
- **Add to calendar (.ics)**: downloads your planned events as an iCalendar file
  to import into Google/Apple/Outlook Calendar (`GET /api/visits/calendar.ics`).
  Times are "floating" — shown in each viewer's local timezone. Events without a
  start time export as all-day.

## Map & coverage (finding gaps)

The **Map** tab plots your outreach on an OpenStreetMap base layer so you can see
which schools/colleges/museums/libraries in a region you have — and haven't —
reached. Institutions come from a catalog you import from OpenStreetMap; each is
shown as a **gap** (orange) until a visit is logged against it, then **reached**
(green). Your own visited venues show in blue.

**Populate the catalog** (admin, one-time per region; safe to re-run to refresh):

```bash
./scripts/import-institutions.sh "Tennessee"
# choose types + link any venues you already logged, by name+city:
./scripts/import-institutions.sh "Tennessee" school,college,museum,library --link-existing
```

`<region>` is any OpenStreetMap admin area name (a US state, or another
`admin_level=4` area). Types: `school, college, university, museum, library`
(default omits `university`). The importer upserts by OSM id, so re-running
updates in place; add `--replace-region` to prune places that have closed.

**Or import by radius from the Admin tab** (no command line): admins get an
"Import institutions near a location" card — type an address / place name (or a
raw `lat, lon`), pick a radius in km or mi, choose types, and click Import. It
geocodes the location (OpenStreetMap Nominatim) and pulls everything within the
radius (max 100 km). Behind a TLS-inspecting corporate proxy, point
`REQUESTS_CA_BUNDLE` at your CA (a container path) so those live calls succeed.

From the map, clicking a gap's **"Log a visit here"** creates a venue linked to
that institution and opens a pre-filled visit form — so logging the visit flips
the marker to reached. The venue picker on the visit form also searches the
catalog ("… · from catalog") and fills in coordinates automatically.

> Map tiles load from `tile.openstreetmap.org` in the browser (fine for a small
> community — mind the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/);
> point at your own tile server for heavy use). Behind a TLS-inspecting proxy,
> set `REQUESTS_CA_BUNDLE` for the backend so the importer trusts your CA.

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
   browser ─ :8080 ───► │  frontend    │  nginx: serves the React build,
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
