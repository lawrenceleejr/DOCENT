# Changelog

All notable changes to DOCENT are documented here. This project uses
[semantic versioning](https://semver.org/); tagged releases publish container
images to GHCR (`ghcr.io/lawrenceleejr/docent-{backend,frontend,backup}`).

## v0.1.5

### Added
- **Every exported report now carries the full Analysis breakdowns** — activity
  by year and by venue type, event type, audience level, and host relationship,
  plus top venues and a communicator leaderboard — across JSON, CSV, Markdown,
  LaTeX, and PDF, and in the Reports page preview. The figures are computed over
  exactly the report's filtered activities, so they always reconcile with the
  rows. Aggregate-only: no descriptions, reflections, ratings, or host contact
  details.
- **PDF reports now include an activity map.** Your report's venues are plotted
  on the same map basemap the web app uses, sized by activity count — a
  citywide report gets street-level detail, a spread-out one a world view. When
  the server can't reach the tile provider it falls back to a dependency-free
  vector coverage map, so report generation never fails or hangs.

### Changed
- **A more native feel on phones.** The layout honors safe-area insets on
  notched devices, adds subtle page-transition fades and loading skeletons, and
  stops iOS from auto-zooming when a form field is focused. The federation
  "add peer" form stacks cleanly on narrow screens.
- **The map now opens at the admin-configured center and coverage radius**
  instead of zooming to fit every venue.

## v0.1.4

### Added
- **Account creation now shows up in the admin login history** alongside
  sign-ins. Each entry is tagged as a login or a registration, and the per-day
  chart breaks the two out — so a new account is visible immediately instead of
  only after its first sign-in.

### Fixed
- **Adding a venue no longer blanks the page.** When the address search
  returned several results that reduced to the same display label (common for
  a street-level query), the autocomplete threw mid-render and unmounted the
  app. Suggestions are now de-duplicated by label before rendering, and
  unnamed results lead with their street address so the list stays useful.
- The map popup's **"Open venue"** button is now solid purple instead of a
  hard-to-read washed-out tint, matching the "Log a visit here" button.

### Security
- The backend **refuses to start when `POSTGRES_PASSWORD` is left at the
  `.env.example` placeholder** (`change-me`), mirroring the existing
  `SECRET_KEY` guard — a forgotten edit now fails loudly instead of quietly
  running with a well-known database credential.

### Changed
- Oxford comma in the login page's "every school, college, museum, and
  library you reach" tagline.

## v0.1.3

### Changed
- **Backups now live on the host, not in a Docker volume.** The nightly dumps
  are written to a configurable host directory (`BACKUP_DIR`, default `./backups`
  inside the DOCENT directory) via a bind mount instead of a Docker-managed
  volume, so they survive `docker compose down -v`, `docker volume prune`, and
  container/volume deletions. Point `BACKUP_DIR` at a separate disk or mount for
  extra isolation. Existing dumps in the old `backups` volume can be copied over
  once with `./scripts/download-backups.sh` before switching.

## v0.1.0 — first tagged release

The initial public release. **Reach out**, track it, and prove your **Broad
Impact.**

### Track & plan
- Log outreach visits (venue, date, audience, people reached, host, notes,
  rating) and **plan** future events with a status workflow; export planned
  events as an `.ics` calendar feed.
- Shared, community-visible record with author/admin edit permissions.

### See your impact
- **Analysis** dashboard: totals, visits & people reached over time, breakdowns
  by venue type / audience / host relationship, top venues, researcher
  leaderboard.
- **Map**: institutions plotted from OpenStreetMap as *reached* vs *coverage
  gaps* on a monochrome basemap; radius import + manual catalog entry.

### Share your impact
- **Public impact page** (`/impact`, off by default): a read-only, shareable
  summary — totals, charts, venue breakdown, recent activity — that never
  exposes private notes, ratings, or communicator identities.
- **Per-instance branding**: set a community name shown in the header, on the
  login page, and on the public page.

### Federate (show sibling instances)
- **Federation**: publish a token-authenticated feed of your completed (and,
  optionally, planned) activities, and subscribe to sibling instances' feeds so
  an activity logged once shows up everywhere — in the Visits list, Map,
  Schedule, and Analysis — never carrying private notes, ratings, or host
  details. Filter by **source** or hide siblings entirely per view.
- Peers sync on an **hourly / daily / weekly** interval via a built-in job:
  incremental, paged pulls with a periodic full reconcile, per-peer status,
  next-sync time, and exponential backoff on failure. **Test** a feed URL before
  adding it, and **Rotate token** to revoke a URL you've shared.

### Report (Broad Impact)
- **Reports**: grant-ready activity exports (PDF / CSV / Markdown / JSON) over a
  custom date range with filters — factual data only, never private notes or
  ratings.

### Run it safely
- One-command Docker deploy: `http://localhost` out of the box, and **built-in
  HTTPS** — set `SITE_DOMAIN` and a bundled Caddy proxy auto-manages the TLS
  certificate. No separate web server to install.
- Nightly rotated `pg_dump` backups with a restore path and an in-app Backups
  panel (list / download / run now).
- Published **multi-arch (amd64 + arm64)** release images on GHCR and a
  pull-only `docker-compose.release.yml` — runs free on an Arm always-free VM
  (Oracle Cloud); see the README's free-hosting guide.
- Registration gated by an admin-set access code; admin password reset for
  recovery; admin tools for users (search, email edit, merge/delete), venue
  merge, and the institution catalog.
- Security hardening: CSP + security headers, localhost-only binding by default,
  strong-`SECRET_KEY` enforcement, argon2 password hashing, HttpOnly cookies.
  See [SECURITY.md](SECURITY.md).
- Licensed **GPLv3**.
