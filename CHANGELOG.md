# Changelog

All notable changes to DOCENT are documented here. This project uses
[semantic versioning](https://semver.org/); tagged releases publish container
images to GHCR (`ghcr.io/lawrenceleejr/docent-{backend,frontend,backup}`).

## Unreleased

### Fixed
- **The map no longer shows an "API KEY REQUIRED" watermark.** CARTO began
  requiring an API key for their anonymous raster basemaps and now stamps that
  notice into the tile pixels — which affected both the Map page and the map
  embedded in PDF reports, so shared reports carried the watermark too. The
  tile source is now admin-configurable and defaults to keyless OpenStreetMap,
  so existing instances recover on upgrade with no action and no signup.
  Because CARTO's own docs say the raster endpoints are being retired, this
  deliberately does not just add a CARTO key field.

### Added
- **Basemap tile settings** in the admin panel: light and dark tile URL
  templates, the attribution line, and a "flatten to grey" toggle. Point them
  at any `{z}/{x}/{y}` raster provider — CARTO with your own key, Stadia,
  MapTiler, or a self-hosted tile server. Leaving the dark URL empty reuses the
  light tiles inverted, so a single keyless source covers both themes. URLs are
  validated on save, so a typo is a form error rather than a blank map.
  Because OpenStreetMap's standard style is colourful, tiles are desaturated by
  default (matched pixel-for-pixel between the web map's CSS and the PDF's
  server-side rendering) to keep the flat backdrop the coloured markers need.
- **The map renders at full resolution on high-DPI screens.** CARTO served
  `@2x` retina tiles; OpenStreetMap serves 256px only, so on a retina display
  the map was drawn at half the screen's pixel density and looked soft. The web
  map now fetches a zoom level deeper and draws it at half size on such screens,
  and the PDF report's map aims at a fixed pixel resolution regardless of
  whether the provider offers `@2x`. A provider that does offer it (CARTO with
  your key) is used directly, without the extra requests.
- **Step-by-step CARTO setup in the admin panel**, for anyone who wants the old
  Positron/Dark Matter look back: where to request a free key (no account, 5
  million tiles a month), copy-to-clipboard light, dark, and attribution values
  ready to paste, and a note to turn "Flatten to grey" off since those styles
  are already muted. Pasting a template with `YOUR_KEY` still in it is rejected
  with a message saying so, rather than silently serving watermarked tiles.
- **Import a colleague's event history on their behalf.** An admin running the
  CSV import can choose which communicator the events are logged for — picked
  once for the whole file, and changeable per event during the review. The
  events belong to that person for every purpose: their profile, their stats,
  their reports, and theirs to edit. Handy when someone hands over a CV or a
  publication list rather than entering it themselves. Non-admins see no
  change, and the API refuses the attribution for anyone who isn't an admin.
- **Admins can open an account for a colleague who won't sign up themselves.**
  **Add user** on the Admin page creates the account with no usable password —
  a long random one, hashed and discarded, so nobody can log in as them — which
  makes them available immediately as a name to log and import events under.
  Handing the account over stays a separate, deliberate act: **Reset password**
  on their row, relayed out of band as before. Self-registration with the access
  code is still how everyone else gets in.

## v0.1.8

### Fixed
- **Upgrades no longer crash on the `is_broadcast` migration.** Its backfill
  compared against `venue_type` enum values in the same transaction that adds
  them, which Postgres rejects on a brand-new database or any upgrade spanning
  both migrations (*"unsafe use of new value"*), crash-looping the backend. It
  now compares the text representation, so `alembic upgrade head` applies
  cleanly from any prior version.

## v0.1.7

### Added
- **Separate remote / broadcast reach.** An event that reached people who
  weren't in the room — a podcast, livestream, video, or media hit — can be
  flagged as **remote / broadcast** reach (auto-detected for online venue
  types, with a hover tooltip explaining it). Remote reach is then tallied
  apart from in-person attendance everywhere: two separate stat tiles on the
  Analysis and Reports pages, a dual-axis "people reached over time" chart
  (in-person on the left, remote on the right, so a huge broadcast number
  doesn't flatten the in-person line), and its own line in every report export.
- **Interview** event type, for the interviews, podcasts, and media hits that
  aren't quite visits.
- **Multi-select audience.** An event can target several audience levels at
  once; filtering matches any of them, and the detail page shows each level.
- **"Host reached out to us"** host relationship — the host contacted the
  communicator, the mirror image of cold outreach.

### Changed
- **"Visits" are now "Events" throughout the interface** — the shared log, the
  form, the filters, the scheduler, and the analysis copy — reflecting that not
  every outreach event is a classroom visit. The data model and API are
  unchanged.
- **People reached now allows up to 500,000,000**, for large-scale media reach.
- **`restart.sh` rebuilds by default**, so a `git pull` followed by a restart
  deploys the new code; pass `--no-build` / `--fast` to just bounce the stack.
- A venue can now be deleted even when events are attached — the attached
  events are removed along with it, after a confirmation.

## v0.1.6

### Added
- **Import your event history from a CSV.** A new **Import CSV** button on the
  Visits page (next to Export CSV) opens a step-through wizard: upload any
  reasonable CSV — the delimiter, encoding, and common column names are
  detected automatically, and **Symplectic Elements** exports are recognised
  (including their day-first dates) — confirm the column mapping, then review
  each row, edit it, and import it as an event or skip it. Dates get special
  care: many spellings parse, ambiguous ones follow the detected convention,
  and an unreadable date is flagged for manual entry rather than guessed. A
  side panel lists every event already recorded on the same day (tagging ones
  just imported) so duplicates are caught before they happen. The whole review
  works from the keyboard: ←/→/↑/↓ move between rows, **S** skips, **Enter**
  imports and advances. Nothing is written until you import a row.
- **Website analytics (optional).** Admins can enable
  [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) — a
  free, cookieless, privacy-first alternative to Google Analytics — by pasting
  the Cloudflare snippet into the new **Admin → Website analytics** panel,
  which includes step-by-step setup instructions. Only the beacon token is
  stored and used (pasted HTML is never executed), visitors sending
  `Do Not Track` are skipped, and clearing the box turns analytics off. The
  bundled nginx CSP allows exactly the two Cloudflare endpoints.
- **Online venue types & venue URLs.** Venues can now be a **YouTube Channel,
  Podcast, Social Media, or Blog** — fitting distributed outreach — and every
  venue has an optional **Website / URL** field, shown as a link on the venue
  page.

### Changed
- **Creating a venue from an address search now auto-fills the name** from the
  place you pick (still editable), so you only retitle it if you want to.
- The venue form marks its required fields, and the new-venue dialog's
  address-search help text reflects the name auto-fill.

### Fixed
- Import wizard: column-mapping corrections are now always applied when the
  review starts — previously they only took effect after a separate re-parse
  step that was easy to miss.

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
