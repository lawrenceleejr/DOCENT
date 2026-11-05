# DOCENT

**D**istributed **O**utreach & **C**ommunity **E**ngagement **N**etwork **T**racker

DOCENT is a self-hosted web app for a scientific community's outreach. Communicators
log each event (venue, date, host, audience, people reached) in one shared record.
The app shows where you've been on a coverage map, summarizes activity on an
analysis dashboard, and exports your **Broad Impact** as a PDF, CSV, Markdown or
JSON report for grants and annual reviews.

**Try it:** a test instance runs at <https://test.docentoutreach.org>. Log in as
`testuser@utk.edu` / `12345678`, or register with access code `3dd2b671`. Data there
is wiped from time to time, so don't put anything real in it.

**Why self-host:** your records stay on your institution's hardware, which makes
data-governance and FERPA review simpler. You hold the database, backups and
exports. [`PRIVACY.md`](PRIVACY.md) lists every outbound call the app makes and how
to turn each off.

**Stack:** FastAPI and PostgreSQL, a React (TypeScript, Mantine) frontend, nginx,
and a backup container, run with Docker Compose.

[Quick start](#quick-start) · [Go live](#go-live-on-a-subdomain) ·
[Published images](#published-images) · [Free cloud hosting](#free-cloud-hosting) ·
[Security](SECURITY.md) · [Data handling](PRIVACY.md) ·
[Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Screenshots

**Events**: the shared log, with search, filters and CSV export.

![Events list](docs/screenshots/01-visits.png)

**Log an event**: one form for completed and planned events. Pick or create a
venue, add host details, audience levels, attendance and notes. Podcasts,
livestreams and other broadcasts count as remote reach, separate from in-person
attendance.

![Log an event](docs/screenshots/05-visit-form.png)

**Analysis**: totals, trends over time, breakdowns by venue type and audience, top
venues, and a communicator leaderboard.

![Analysis dashboard](docs/screenshots/02-dashboard.png)

**Map**: catalog institutions you haven't reached are orange, ones you have are
green.

![Coverage map](docs/screenshots/03-map.png)

**Scheduler**: upcoming planned events, exportable to any calendar as `.ics`.

![Scheduler](docs/screenshots/04-schedule.png)

**Reports**: a summary of your own or the whole community's activity over any date
range.

![Reports](docs/screenshots/07-reports.png)

**Admin**: users, the access code, site settings, and importing institutions from
OpenStreetMap.

![Admin](docs/screenshots/06-admin.png)

## Quick start

On any machine with Docker:

```bash
git clone https://github.com/lawrenceleejr/DOCENT.git && cd DOCENT
./scripts/start.sh
```

On first run, `start.sh` writes a `.env` with random secrets, builds and starts the
stack, and prints an access code. Open <http://localhost:8080> and register with
that code. The first account becomes the admin.

The app binds only to `127.0.0.1` until you put it on a domain. To skip the build,
use the [published images](#published-images).

## Go live on a subdomain

The recommended setup is a machine your group controls (a lab workstation or
department server) with a subdomain from university IT pointing at it. **Admin →
Site address & domain setup** drafts the IT request for you.

1. **DNS.** Ask IT for an A record: `docent.university.edu` → your machine's IP.
   They'll also need to open ports 80 and 443 if the machine is behind a campus
   firewall.
2. **HTTPS.** Set the domain and restart. A bundled [Caddy](https://caddyserver.com)
   container obtains and renews the certificate:

   ```bash
   echo 'SITE_DOMAIN=docent.university.edu' >> .env
   ./scripts/start.sh
   ```

   DNS must already point at the machine, and ports 80 and 443 must be reachable,
   for the certificate to issue. With `SITE_DOMAIN` empty, Caddy doesn't run.

Then share the access code. Set `CONTACT_EMAIL` so people know who to ask for it.

### Using your own reverse proxy

Leave `SITE_DOMAIN` empty and point your nginx, Traefik or Apache at
`http://127.0.0.1:8080`. DOCENT doesn't need to know its hostname. Your proxy must
pass `X-Forwarded-Proto` so the login cookie is marked `Secure`:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
}
```

If it can't, set `COOKIE_SECURE=true`. A proxy in another container can join the
Docker network and target `http://frontend:80`. One on another host needs
`BIND_HOST=0.0.0.0`, with port 8080 firewalled to that host.

See [SECURITY.md](SECURITY.md) for the deployment checklist.

### Scripts

| Script | Does |
|---|---|
| `start.sh` | Build and start; creates `.env` on first run. Also deploys updates after `git pull`. |
| `stop.sh` | Stop the stack. Data is kept. |
| `restart.sh` | Rebuild and restart. `--no-build` just restarts the containers. |
| `backup.sh` | Back up the database now. |
| `list-backups.sh` | List backups. |
| `download-backups.sh [dir]` | Copy backups somewhere else. |
| `restore.sh <file>` | Restore from a backup. |
| `seed-demo.sh` | Load a fictional demo dataset. Safe to re-run. |
| `import-institutions.sh` | Import a region's institutions for the map. |

All live in `scripts/` and run from the repo root.

## Published images

Each tagged release publishes `ghcr.io/lawrenceleejr/docent-{backend,frontend,backup}`
for amd64 and arm64. `:latest` is the newest release, `:vX.Y.Z` pins one, and
`:edge` tracks `main`.

```bash
curl -O https://raw.githubusercontent.com/lawrenceleejr/DOCENT/main/docker-compose.release.yml
curl -o .env https://raw.githubusercontent.com/lawrenceleejr/DOCENT/main/.env.example
# edit .env: POSTGRES_PASSWORD, SECRET_KEY (openssl rand -hex 32), INVITE_CODE, CONTACT_EMAIL
DOCENT_TAG=v0.1.9 docker compose -f docker-compose.release.yml up -d
```

Update with `docker compose -f docker-compose.release.yml pull` and `up -d`. HTTPS
works the same as in [Go live](#go-live-on-a-subdomain).

## Free cloud hosting

Without a machine of your own, an always-free VM is enough:

| Provider | Free VM | Notes |
|---|---|---|
| Oracle Cloud | Ampere A1 (Arm), up to 4 cores / 24 GB | Recommended; steps below |
| Oracle Cloud | E2.1.Micro (x86), 1 GB | Add swap |
| Google Cloud | e2-micro, 1 GB, some US regions | Add swap |
| AWS | t3.micro | Free for 12 months only |

Free PaaS tiers (Render, Railway, Fly) sleep, lose disk, or expire databases, so
they don't suit a long-running instance.

### Oracle Cloud, step by step

1. **Account.** Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/).
   The home region can't be changed later.
2. **Instance.** Compute → Instances → Create instance. Shape
   `VM.Standard.A1.Flex` with 1–2 OCPUs and 6–12 GB RAM, Ubuntu 22.04 or newer, a
   public IPv4 address, and your SSH key. Note the public IP.
3. **Firewall, in two places.** In the VCN's default security list, add ingress
   rules for TCP 80 and 443 from `0.0.0.0/0`. Oracle's Ubuntu image also blocks
   them in iptables, so after SSHing in:

   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

4. **Docker and DOCENT.**

   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
   sudo usermod -aG docker $USER && newgrp docker
   git clone https://github.com/lawrenceleejr/DOCENT.git && cd DOCENT
   ./scripts/start.sh
   ```

5. **Domain.** Point an A record at the public IP, then
   `echo 'SITE_DOMAIN=docent.example.org' >> .env && ./scripts/start.sh`.
6. **Admin.** Open the site and register with the printed access code.

A free VM is still one machine, so copy backups off it regularly with
`download-backups.sh`.

## Configuration

Set in `.env`; apply with `./scripts/start.sh`.

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER` | `docent` | Database name and user |
| `POSTGRES_PASSWORD` | required | Database password |
| `SECRET_KEY` | required | Session signing key (`openssl rand -hex 32`) |
| `INVITE_CODE` | required | Access code for registering; empty closes registration |
| `CONTACT_EMAIL` | empty | Shown on login and register pages |
| `SITE_DOMAIN` | empty | Domain to serve over HTTPS via Caddy |
| `SITE_URL` | empty | Public address, used for links in the admin helpers and federation feed |
| `SITE_NAME` | empty | Community name in the header and on public pages |
| `PUBLIC_PAGE` | `false` | Serve the public impact page at `/impact` |
| `ACCESS_TOKEN_DAYS` | `7` | Login session length |
| `COOKIE_SECURE` | `auto` | `auto` marks the cookie Secure over HTTPS |
| `HTTP_PORT` | `8080` | Host port for the web UI |
| `BIND_HOST` | `127.0.0.1` | Interface to bind; `0.0.0.0` only on a trusted network |
| `BACKUP_HOUR` | `02` | Hour (UTC) of the nightly backup |
| `BACKUP_DIR` | `./backups` | Host folder for backups |
| `OVERPASS_URL` | overpass-api.de | OpenStreetMap endpoint for the institution importer |

`SITE_NAME`, `PUBLIC_PAGE`, the access code and contact email can also be changed
in the Admin tab.

## Backups

Every night at `BACKUP_HOUR`, the backup container dumps the database into
`BACKUP_DIR`, checks the dump with `pg_restore --list`, and keeps 7 daily, 4
weekly and 12 monthly copies. `BACKUP_DIR` is an ordinary host folder, not a
Docker volume, so `docker compose down -v` doesn't touch it. Putting it on a
separate disk is better still.

```bash
./scripts/backup.sh                              # back up now
./scripts/download-backups.sh ~/docent-backups   # copy off the machine
./scripts/restore.sh daily/docent-2026-07-10.dump
```

`restore.sh` asks for confirmation and stops the backend while it runs. Test a
restore now and then with a throwaway event.

The `db` and `backup` images are both pinned to `postgres:16`. Upgrade them
together, after a final backup on the old version.

## Features

### Planned and completed events

Each event is **planned** or **completed**. Only completed events count toward
the dashboard and map, so scheduling ahead doesn't inflate your numbers. The
Scheduler lists upcoming events with a **Mark done** button, and **Add to
calendar** downloads them as an `.ics` file. Events without a start time export
as all-day.

### CSV import

**Import CSV** on the Events page brings in an existing spreadsheet or a
**Symplectic Elements** export. DOCENT guesses the column mapping for you to
correct, reads ambiguous dates using the file's convention, and flags any date
it can't parse. Then you step through each row: edit it, pick the venue, and
import or skip it, with keyboard shortcuts (arrows, S, Enter). A side panel
lists events already logged on the same day, so duplicates are easy to spot.
Nothing is saved until you import a row.

Admins can import on behalf of a colleague. The events then belong to that
person in their profile, stats and reports.

![CSV import wizard](docs/screenshots/10-import.png)

### Accounts for people who won't sign up

**Add user** on the Admin page creates an account with no usable password, so
nobody can log in to it. You can still log and import that person's events, and
they appear in the directory and reports. If they later want to log in, use
**Reset password** and give them the temporary password yourself. Everyone else
registers with the access code as usual.

### Reports

The Reports tab exports activity for you or the whole community, filtered by
date range, status, venue type, event type and audience, as PDF, CSV, Markdown or
JSON. Columns are factual: date, title, event type, venue, location, audience,
people reached, duration, presenters, host name and role, status. Private notes,
reflections, ratings and host contact details are never included.

### Public impact page

An admin can publish a read-only page at `/impact` showing aggregate numbers,
charts, a venue breakdown and recent event titles. It never shows notes, ratings,
host contacts, or who logged what. It's off by default; turn it on under
**Admin → Registration** or with `PUBLIC_PAGE`.

![Public impact page](docs/screenshots/08-impact.png)

### Map and coverage

The map plots institutions from a catalog you import from OpenStreetMap: orange
until an event is logged there, then green. Your own venues are blue. Clicking an
orange marker's **Log an event here** creates the venue and opens a pre-filled
form.

Import a catalog from the Admin tab by address and radius (up to 100 km), or by
region from the command line:

```bash
./scripts/import-institutions.sh "Tennessee"
./scripts/import-institutions.sh "Tennessee" school,college,museum,library --link-existing
```

Re-running updates in place; `--replace-region` also removes places that have
closed.

Map tiles come from OpenStreetMap by default. **Admin → Basemap tiles** can switch to
another tile provider (for example CARTO with your own key, or a self-hosted tile
server). Mind the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/)
for heavy use.

### Federation

Groups that each run DOCENT can show each other's activity. In **Admin →
Federation**, publish your feed and share its URL privately; the token in it is
the credential, and **Rotate token** revokes it. Paste a sibling's feed URL to
subscribe, and DOCENT pulls it hourly, daily or weekly. Sibling events appear in
the Events list, Map and Analysis with a badge and a link back, and every view
can hide them.

Feeds carry only the date, place, person, event type, people reached and a
link back. By default they carry only completed events, with an option to
share planned ones too. Combined totals can double-count someone active in two
groups; the dashboard says so when siblings are included. Behind a
TLS-inspecting proxy, set `REQUESTS_CA_BUNDLE` for the backend.

### Analytics

Paste a [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/)
snippet into **Admin → Website analytics** to count visits without cookies. The
admin panel has the setup steps, and you don't need to move your DNS to
Cloudflare. DOCENT keeps only the token, builds the script tag itself, and skips
visitors who send Do Not Track. Clear the box to turn it off.

![Website analytics setup](docs/screenshots/09-analytics.png)

### Policy pages

**Admin → Policy documents** publishes a privacy policy and terms of use, written
in Markdown, at `/privacy` and `/terms`. Both are readable without signing in.
Nothing is published until you save.

### Also

- **Accounts**: registration always requires the access code. The first account
  is the admin. Everyone signed in sees all events; only an event's author or an
  admin can edit it.
- **Shared venues**: the venue picker searches existing venues first, so the
  community keeps one list.
- **Languages**: the interface is in English, Spanish, French, Traditional and
  Simplified Chinese, Vietnamese and Tagalog. Events record the language they
  were held in.
- **Profiles**: members list schools attended and languages spoken. Admins can
  open a read-only directory to everyone.

## Development

Run the backend and frontend locally against a containerized Postgres:

```bash
docker compose -f docker-compose.dev.yml up -d        # Postgres on :5432

cd backend
python3 -m venv .venv && .venv/bin/pip install -e '.[test]'
DATABASE_URL=postgresql+psycopg://docent:docent@localhost:5432/docent \
COOKIE_SECURE=false .venv/bin/uvicorn app.main:app --reload   # API on :8000, docs at /docs

cd frontend
npm install && npm run dev                            # UI on :5173
```

Tests run against real Postgres, never SQLite: `cd backend && .venv/bin/pytest`.

Schema changes need a hand-written Alembic migration in `backend/alembic/versions/`;
migrations run on backend startup. [CONTRIBUTING.md](CONTRIBUTING.md) covers the
rules.

Behind a TLS-inspecting proxy, put its CA bundle at `backend/extra-ca.crt` and
`frontend/extra-ca.crt` (both git-ignored) for the Docker builds.

### Architecture

```
browser ── :8080 ──► frontend (nginx) ── /api ──► backend (FastAPI) ──► db (postgres:16)
                     serves the React build                                  │
                                                                       backup ── nightly pg_dump ──► BACKUP_DIR
```

Auth is a JWT in an httpOnly, `SameSite=Lax` cookie. The browser and API share
an origin, so there's no CORS.

### After deploying or upgrading

1. `docker compose ps`: all services up, `db` and `backend` healthy.
2. Register or log in; the admin sees the Admin tab.
3. Log an event with a new venue, then edit it.
4. The Analysis tab shows charts.
5. `./scripts/backup.sh` writes a dump to `BACKUP_DIR/daily/`.

## Citing DOCENT

Use GitHub's **Cite this repository** button, which reads
[`CITATION.cff`](CITATION.cff). To mint a DOI, enable the repository on
[Zenodo](https://zenodo.org)'s GitHub page and publish a GitHub release. Zenodo
archives it using [`.zenodo.json`](.zenodo.json). Then add the DOI to
`CITATION.cff` and the badge here.

## License

Copyright (C) 2026 Lawrence Lee. DOCENT is free software under the
[GNU General Public License v3](LICENSE) or later, with no warranty.
