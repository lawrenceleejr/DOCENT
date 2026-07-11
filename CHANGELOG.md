# Changelog

All notable changes to DOCENT are documented here. This project uses
[semantic versioning](https://semver.org/); tagged releases publish container
images to GHCR (`ghcr.io/lawrenceleejr/docent-{backend,frontend,backup}`).

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
