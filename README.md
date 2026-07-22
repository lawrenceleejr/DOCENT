# DOCENT — Reach out. Track it. Prove your Broad Impact.

**D**istributed **O**utreach & **C**ommunity **E**ngagement **N**etwork **T**racker — a self-hosted web app that helps a scientific community **Reach out** (to grade schools, community colleges, museums, libraries, and beyond), keep one shared record of every visit, and turn it into **Broad Impact** documentation for grant reports at the click of a button.

Communicators register accounts and log each visit — venue, date, host, audience, how it went, people reached — and the whole community shares a live **Analysis** dashboard and a coverage **Map**. When it's reporting season, the **Reports** tab exports a grant-ready summary of your collective **Broad Impact** (PDF / CSV / Markdown / JSON) over any date range.

> ### 🚀 Try it now
> A public **test instance** is running at **<https://test.docentoutreach.org>** —
> click around, log a demo visit, explore the map, dashboard, and reports. Log in
> with **`testuser@utk.edu`** / **`12345678`**, or register your own account with
> access code **`3dd2b671`**. It's a sandbox: don't put anything real in it, and
> expect the data to be wiped from time to time.

### Why self-host? Your data never leaves your institution
DOCENT runs entirely on **your** server — no third-party cloud, no vendor with a
copy of your records. Everything stays inside your institution's own
infrastructure, which makes it far simpler to satisfy campus data-governance and
**FERPA** obligations for any student-related information. You own the database,
the backups, and the export — and you can delete or move it whenever you like.
*(Self-hosting supports FERPA compliance; actual compliance depends on how your
institution deploys and configures it.)*

**Stack:** FastAPI + PostgreSQL backend, React (TypeScript, Mantine, Recharts) frontend, nginx, and a backup sidecar with nightly rotated `pg_dump`s — deployed with a single `docker compose up`.

**Docs:** [Quick start](#quick-start-try-it-on-your-own-machine) · [Go live on a subdomain](#go-live-put-it-on-your-subdomain) · [Run the published images](#run-the-published-images-no-build) · [Free cloud hosting](#no-machine-of-your-own-run-it-free-in-the-cloud) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · GPLv3

---

## Screenshots

**Visits** — the shared log of every outreach event, with search, filters (date, type, audience, status), and CSV export.

![Visits list](docs/screenshots/01-visits.png)

**Log / schedule a visit** — one form for both. Toggle *Completed* vs *Planned*, pick or create a venue (searchable, catalog-backed), add host details, attendance, rating, and notes.

![Log a visit](docs/screenshots/05-visit-form.png)

**Analysis dashboard** — totals, visits & people reached per half-year, breakdowns by venue type and audience, top venues, and a researcher leaderboard.

![Analysis dashboard](docs/screenshots/02-dashboard.png)

**Map & coverage** — every institution plotted as a **gap** (orange) or **reached** (green) so you can see who you're missing. Clustered, filterable by type and coverage. *(The OpenStreetMap base tiles render in your browser; they're blank in this static capture.)*

![Coverage map](docs/screenshots/03-map.png)

**Schedule** — your upcoming planned events, with one-click **Add to calendar (.ics)** for Google/Apple/Outlook.

![Schedule](docs/screenshots/04-schedule.png)

**Reports** — export a grant-ready summary of activity (yours or the whole community) over a custom date range as PDF, CSV, Markdown, or JSON. Factual data only — no private notes or ratings.

![Reports](docs/screenshots/07-reports.png)

**Admin** — manage users, reset passwords, and **import institutions near a location** (address + radius in km/mi) straight from OpenStreetMap.

![Admin](docs/screenshots/06-admin.png)

---

## Quick start (try it on your own machine)

DOCENT is built to be trivial to stand up. If a machine has **Docker**, you are
**one command** away from a running app you can log into and explore:

```bash
git clone <this-repo> && cd DOCENT
./scripts/start.sh
```

That's the whole install. On first run `start.sh` creates a `.env` with random
secrets, builds the images, starts the full stack (web app, database, and nightly
backups), and **prints an access code**. Then:

1. Open **http://localhost:8080** in your browser.
2. Register with the access code it printed — **the first account becomes the admin**.
3. Play around: log a visit, import some institutions, explore the Map, Analysis
   dashboard, and Reports.

> Prefer not to build anything? `docker compose -f docker-compose.release.yml up -d`
> pulls prebuilt images instead — see [Run the published images](#run-the-published-images-no-build).

At this point everything runs **locally and privately** (the app binds only to
`127.0.0.1`), so it's a safe sandbox to evaluate. When you're ready to open it up to
your community, give it a real web address ⬇.

## Go live: put it on your subdomain

This is the recommended setup for real use: run DOCENT on a machine your group
controls — a lab workstation, a department server, a spare box in the corner — and
ask your **university IT to point a subdomain at it**. Your data stays on your own
hardware, and everyone reaches the app at a friendly HTTPS address like
`https://docent.university.edu`.

There are only two moving parts, and DOCENT drafts both for you in **Admin → Site
address & domain setup** (enter the address you want and the machine's IP):

**1. Ask IT to point a subdomain at your machine.** They add a single **DNS "A
record"** mapping the name to the machine's IP address — a small, routine request.
The admin panel generates a ready-to-send email; it boils down to:

> **Type:** A · **Name:** `docent.university.edu` · **Value:** `<your machine's IP>` · **TTL:** 3600

> If the machine is on the campus network behind NAT/a firewall, mention that in the
> same request — IT will tell you the right address to use and open ports **80** and
> **443** for you.

**2. Turn on HTTPS — it's built in.** You don't install or configure a web server.
Set one line in `.env` and re-run `start.sh`; DOCENT starts a bundled
[Caddy](https://caddyserver.com) container that serves HTTPS and obtains and renews
the TLS certificate automatically:

```bash
echo 'SITE_DOMAIN=docent.university.edu' >> .env   # your subdomain from step 1
./scripts/start.sh
```

That's the entire HTTPS setup. When `SITE_DOMAIN` is set, `start.sh` brings up the
Caddy proxy (Docker Compose `tls` profile) on ports 80/443 in front of the app; when
it's empty, Caddy never runs and you stay on `http://localhost`. The certificate
persists in a Docker volume across restarts.

> **Prerequisites for the automatic certificate:** the domain's DNS must already
> point at this machine (step 1), and inbound ports **80** and **443** must be open.
> Caddy uses port 80 for the certificate challenge, then serves everything on 443.

Once DNS propagates (usually minutes, up to an hour), open
`https://docent.university.edu` and share the access code with your community. Set
`CONTACT_EMAIL` in `.env` (or in the admin panel) so people know who to ask for it.
`COOKIE_SECURE=auto` (the default) marks the login cookie `Secure` over HTTPS, and
the app container itself stays bound to `127.0.0.1` — only Caddy is exposed.

#### Already have a reverse proxy? (bring your own)

If the machine already runs nginx / Traefik / Apache / HAProxy and you just want to
add DOCENT behind it, **leave `SITE_DOMAIN` empty** — that keeps the bundled Caddy
switched off so it never touches ports 80/443 or fights your existing proxy. DOCENT
just listens on `http://127.0.0.1:8080`; point a `location` / virtual host / service
in your proxy at that address and you're done.

**Do you need to tell DOCENT its subdomain? No.** The app is host-agnostic — it's
served same-origin behind whatever proxy fronts it, the session cookie is host-only,
and its content-security-policy is `self`, so it works at any hostname without being
configured for one. Setting `SITE_URL` is purely cosmetic (it just labels the
in-app domain-setup helper); the app functions identically whether or not you set it.

The one thing your proxy **must** do is forward the original scheme so the login
cookie gets its `Secure` flag over HTTPS. Either pass the header (DOCENT honors it):

```nginx
# in your existing nginx server block for docent.university.edu (TLS terminated by you)
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Proto $scheme;   # ← so DOCENT knows it's HTTPS
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
}
```

…or, if your proxy doesn't send `X-Forwarded-Proto`, just force it in `.env` with
`COOKIE_SECURE=true`. (Traefik and Caddy send the header by default, so no extra
config there.)

> If your proxy runs in a **separate container**, put it on the same Docker network
> as `frontend` and target `http://frontend:80` instead — no host port needed. If it
> runs on a **different host**, set `BIND_HOST=0.0.0.0` so `:8080` is reachable, and
> firewall that port so only your proxy can reach it.

See **[SECURITY.md](SECURITY.md)** for the full secure-deployment checklist.

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
| `./scripts/seed-demo.sh` | Fill the app with a realistic demo dataset (fictional communicators/venues/visits) for evaluation or a talk. Merge-safe: re-running never duplicates. |

## Run the published images (no build)

Every tagged release publishes ready-to-run container images to the GitHub
Container Registry, so you can deploy without cloning the source or building
anything locally:

- `ghcr.io/lawrenceleejr/docent-backend`
- `ghcr.io/lawrenceleejr/docent-frontend`
- `ghcr.io/lawrenceleejr/docent-backup`

Tags: `:latest` is the newest tagged release, `:vX.Y.Z` pins a specific release,
and `:edge` tracks the `main` branch. Pull with `docker-compose.release.yml`,
which references these images instead of building:

```bash
# 1. grab the pull-based compose file and an env template
curl -O https://raw.githubusercontent.com/lawrenceleejr/DOCENT/main/docker-compose.release.yml
curl -o .env https://raw.githubusercontent.com/lawrenceleejr/DOCENT/main/.env.example

# 2. edit .env — set POSTGRES_PASSWORD, SECRET_KEY, INVITE_CODE, CONTACT_EMAIL
#    (SECRET_KEY: openssl rand -hex 32   INVITE_CODE: any shared access code)

# 3. start it (pin a release with DOCENT_TAG, or omit for :latest)
DOCENT_TAG=v0.1.0 docker compose -f docker-compose.release.yml up -d
```

This is the fastest path for a fresh machine: no Node/Python toolchain, no build
step — just Docker pulling the release images. To update,
`docker compose -f docker-compose.release.yml pull && … up -d`. The images are
built for **amd64 and arm64**, so they run on both x86 and Arm hosts. Expose it to
your community with the same subdomain + Caddy steps as
[Go live](#go-live-put-it-on-your-subdomain).

## No machine of your own? Run it free in the cloud

The setup above assumes a machine you control. If you don't have one, DOCENT's whole
stack fits comfortably inside a free "always-free" cloud VM instead. These tiers are
genuinely $0 (a card may be required for identity verification, but you are not
charged while you stay on always-free resources):

| Provider | Always-free VM | Notes for DOCENT |
|---|---|---|
| **Oracle Cloud** ⭐ | **Ampere A1 (Arm): up to 4 cores / 24 GB RAM**, 200 GB storage — *forever* | **Recommended.** Huge headroom; step-by-step below. |
| **Oracle Cloud** | `VM.Standard.E2.1.Micro` (x86, 1 core / 1 GB RAM) ×2 — forever | Works but 1 GB RAM is tight; add swap. Use if you prefer x86. |
| **Google Cloud** | one `e2-micro` (2 shared vCPU / 1 GB RAM), 30 GB disk, select US regions — forever | Fine for a light demo; add swap for Postgres. |
| **AWS** | `t3.micro` — **12 months only**, then billed | OK for a time-boxed demo, not free forever. |

> PaaS "one-click" free tiers (Render/Railway/Fly) either sleep on idle, drop your
> disk, or expire the database after ~30 days — not suitable for a durable
> deployment. A free always-free **VM** keeps your data and the backup sidecar
> intact, which is why it's the recommendation here.

### Deploy on Oracle Cloud Always Free (step by step)

This gets you a public, HTTPS DOCENT on a free Arm VM in about 20 minutes.

**1. Create the account** — sign up at
[oracle.com/cloud/free](https://www.oracle.com/cloud/free/). Pick a Home Region
near you (can't be changed later). A card is used for identity verification only;
"Always Free" resources are never billed.

**2. Create the VM instance**
- Console → hamburger menu → **Compute → Instances → Create instance**.
- **Image & shape → Edit shape → Ampere** → `VM.Standard.A1.Flex`. Set **1–2
  OCPUs** and **6–12 GB RAM** (all within the 4-core/24 GB always-free limit).
- **Image**: **Canonical Ubuntu 22.04** (or newer).
- **Networking**: keep "Create new virtual cloud network", and ensure **"Assign a
  public IPv4 address"** is on.
- **SSH keys**: upload your public key (`~/.ssh/id_ed25519.pub`) or download the
  generated key pair — you need it to log in.
- Click **Create** and wait for the instance to reach **Running**; note its
  **Public IP address**.

**3. Open the firewall — both layers** (this is the #1 Oracle gotcha)
- *Cloud security list*: Instance → its **Virtual Cloud Network → Security Lists →
  Default Security List → Add Ingress Rules**. Add two rules, Source `0.0.0.0/0`,
  IP Protocol **TCP**, Destination port **80**, then another for **443**.
- *OS firewall*: Oracle's Ubuntu image ships with restrictive iptables rules, so
  also open the ports on the host after you SSH in (next step):
  ```bash
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save        # persist across reboots
  ```

**4. SSH in and install Docker**
```bash
ssh ubuntu@<PUBLIC_IP>

sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker   # run docker without sudo
```

**5. Start DOCENT**
```bash
git clone https://github.com/lawrenceleejr/DOCENT.git && cd DOCENT
./scripts/start.sh
```
`start.sh` writes a `.env` with random secrets, **prints your access code**
(`INVITE_CODE`), builds the images (native on Arm), and starts everything on
`127.0.0.1:8080`. Prefer no build at all? Use the published multi-arch images
instead: `docker compose -f docker-compose.release.yml up -d` (set the secrets in
`.env` first — see [Run the published images](#run-the-published-images-no-build)).

**6. Point a domain at it + automatic HTTPS** — you need a domain or subdomain you
control pointing at the instance's public IP (a subdomain your institution points at
the VM — same A-record request as [Go
live](#go-live-put-it-on-your-subdomain) — or a domain you own). Add an **A record**
→ the instance's public IP, then just set it in `.env` and re-run:
```bash
echo 'SITE_DOMAIN=docent.example.org' >> .env
./scripts/start.sh
```
The bundled Caddy proxy starts automatically, fetches a TLS certificate, and serves
HTTPS on 443 — no separate install. (The security-list + iptables rules from step 3
already opened 80/443.)

**7. Create your admin account** — open `https://docent.example.org`, register with
the access code `start.sh` printed (**the first account becomes admin**), then share
the code only with the people you want to let in.

That's it — a free, self-hosted, HTTPS DOCENT. Take backups off-box periodically
(`./scripts/download-backups.sh`) since a free VM is still a single machine.

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` | `docent` | Database name / user |
| `POSTGRES_PASSWORD` | — (required) | Database password |
| `SECRET_KEY` | — (required) | JWT signing key — `openssl rand -hex 32` |
| `INVITE_CODE` | — (required) | Access code needed to register; empty = registration closed |
| `CONTACT_EMAIL` | empty | Email shown on login/register for access-code & reset requests |
| `SITE_DOMAIN` | empty | Set to your domain (e.g. `docent.your-org.edu`) to serve HTTPS via the bundled Caddy proxy; empty = `http://localhost` only |
| `SITE_URL` | empty | Canonical public address shown in-app; also seeds the admin domain-setup helper |
| `SITE_NAME` | empty | Community name shown in the header, login page, and public impact page (admins can also set it in-app) |
| `PUBLIC_PAGE` | `false` | Serve the read-only public impact summary at `/impact` (admins can also toggle it in-app) |
| `ACCESS_TOKEN_DAYS` | `7` | Login session lifetime |
| `COOKIE_SECURE` | `auto` | `auto` sets Secure on HTTPS; force with `true`/`false` |
| `HTTP_PORT` | `8080` | Host port for the web UI (reverse-proxy forwards here) |
| `BIND_HOST` | `127.0.0.1` | Interface the port binds to; `0.0.0.0` only for a trusted LAN |
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

## Reports (grant-ready exports)

The **Reports** tab exports a shareable summary of outreach activity — the kind
of thing you paste into a grant report, annual review, or "look what we did"
one-pager. It is deliberately a **bragging document**: only factual activity
data, never private notes, reflections, ratings, or host contact details.

- **Scope:** *My activities* or *Everyone* (the whole community).
- **Filters:** custom date range, status (completed / planned / all), venue
  type, event type, and audience level. A live preview table and summary
  (activities, people reached, distinct venues) update as you change filters.
- **Formats:** download the same filtered report as **PDF** (a formatted table
  for handing off), **CSV** (spreadsheets), **Markdown** (drop into a doc), or
  **JSON** (machine-readable). One endpoint serves all four:
  `GET /api/reports/activities?format=pdf|csv|md|json&scope=…&date_from=…`.

Columns are factual: date, activity, event type, venue, city/state, audience,
people reached, duration, presenter, co-presenters, host name/role, and status.

## Public impact page & branding

Every instance can publish a **read-only impact page** at `/impact` — a shareable
"look what our community has done" summary for department pages, funders, and the
public. It shows aggregate numbers (events, people reached, venues,
communicators), the over-time charts, a venue-type breakdown, and recent activity
titles — and **never** private notes, ratings, host contacts, or who logged what.

It's **off by default**. An admin turns it on (and sets the **community name**
that brands the header, login page, and impact page) under **Admin →
Registration**, or via `SITE_NAME` / `PUBLIC_PAGE` in `.env`.

![Public impact page](docs/screenshots/08-impact.png)

## Federation (show sibling instances' activities)

Communicators often work with more than one outreach group — each running its own
DOCENT. **Federation** lets an instance display activities pulled from a list of
**sibling instances**, so an activity logged once anywhere shows up everywhere —
in the **Visits list**, the **Map**, and the **Analysis** stats — with no
duplicate data entry. Sibling rows are clearly badged and link back to the
instance that owns them; to see full detail you follow that link and sign in
there. What crosses the wire is deliberately minimal: **date, place (+ coords /
type), the person, event type, people reached, and a deep-link** — never
descriptions, reflections, ratings, or host contact details.

**Publish your feed** (Admin → Federation): flip **Publish to federation** on and
copy **Your feed URL**. It looks like
`https://you.edu/api/federation/activities?token=…` and is reachable with a plain
`curl`. The token in the URL is the only credential, so share it privately and
serve over HTTPS; **Rotate token** invalidates a URL you've already handed out
(you'll need to re-share the new one). Set your instance's **Site URL** (Admin →
Site address) so the feed's deep-links are absolute. By default the feed carries
**completed** activities only; flip **Publish planned events** to also share your
upcoming schedule, so siblings can see planned outreach on their Schedule page.

**Subscribe to siblings** (Admin → Federation → *Sibling instances*): paste a
sibling's feed URL and hit **Test** to confirm it's reachable (it shows the
instance name and how many activities are available) before you Add. Pick a sync
interval (**hourly / daily / weekly**) and Add. DOCENT pulls each due peer on its
interval (a built-in background job) and caches a limited copy locally; **Sync
now** forces an immediate pull. The peer table shows each sibling's **last sync**,
**next sync**, live status, and activity count — a failing peer is retried with
**exponential backoff** (never more often than its interval, capped at a week) and
its error count is surfaced on the status badge. Scheduled pulls are **incremental
and paged** (only rows changed since the last sync, so arbitrarily large peers
sync cheaply), with a periodic **full reconcile** that also propagates remote
deletions.

Sibling activities then appear by default across the app, each view with a filter
to hide them (**Include sibling instances**) or narrow to a single **Source**. On
the Map, a sibling point that coincides with a place you've already reached
collapses into the single green "reached" marker. The public `/impact` page has
its own toggle to count the wider network in its totals — **numbers only, never
sibling names**.

> Only **completed** visits appear in impact/coverage counting; planned events
> stay on the Schedule page. Combined stats can double-count a communicator who
> takes part through more than one instance — the dashboard and impact page note
> this when siblings are included. Leaderboards, and the audience /
> host-relationship breakdowns, count your own instance's activities only (the
> feed doesn't carry those fields). Behind a TLS-inspecting proxy, set
> `REQUESTS_CA_BUNDLE` for the backend so peer pulls trust your CA.

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
- **Localization** — the interface is available in English, Spanish, French, Traditional Chinese, Simplified Chinese, Vietnamese, and Tagalog. Switch languages from the globe icon in the header; your choice is remembered in the browser (no account setting).
- **Visit language** — record which language a visit happened in, picked from a searchable list of world languages. Filter the visit list by language and see it on each visit's detail page and reports.
- **Member profiles** — list the schools you attended (auto-adds you as an alumnus contact on that venue's page) and the languages you speak, from your Profile page. Admins can filter the user list by school or language on the Admin tab, and can optionally let any signed-in member browse a read-only Directory of everyone's schools and languages.

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

## Citing DOCENT

If DOCENT helps your outreach or Broader Impacts reporting, please cite it —
GitHub's **"Cite this repository"** button (top right of the repo page) generates
the reference from [`CITATION.cff`](CITATION.cff).

**Getting a DOI (one-time setup, ~5 minutes):**

1. Log in to [zenodo.org](https://zenodo.org) with your GitHub account.
2. On Zenodo's **GitHub** settings page, flip the toggle for `lawrenceleejr/DOCENT`.
3. Publish a **GitHub release** (e.g. `v0.1.0`) — Zenodo automatically archives it
   and mints a DOI (plus a *concept DOI* that always points at the latest version).
4. Paste the concept-DOI badge Zenodo gives you at the top of this README, and add
   the DOI to `CITATION.cff` (`doi:` field). Metadata for the archive is already
   provided in [`.zenodo.json`](.zenodo.json).

## License

DOCENT — Distributed Outreach & Community Engagement Network Tracker

Copyright (C) 2026 Lawrence Lee

This program is free software: you can redistribute it and/or modify it under
the terms of the **GNU General Public License** as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the [GNU General Public License](LICENSE) for more
details.
