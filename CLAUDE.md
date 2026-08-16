# DOCENT — project conventions for AI assistants

## Workflow

- **README screenshots**: after pushing any user-visible feature, regenerate the
  screenshots in `docs/screenshots/` (same filenames) from a running instance
  seeded with `./scripts/seed-demo.sh`, and commit them with the feature. The
  README's images must always reflect the current UI.
- All work happens on the designated feature branch; never push elsewhere.
- Run `cd backend && pytest` (against real Postgres — never SQLite) and
  `cd frontend && npm run build` before every commit that touches code.
## Migrations & upgrades

- Schema changes need a hand-written Alembic migration in
  `backend/alembic/versions/`. The backend runs `alembic upgrade head` in a
  **single transaction** on startup, so every migration must apply cleanly *in
  one batch from any supported starting point* — a brand-new empty database and
  the previous release alike.
- Create native enums explicitly before use, and **never use a just-added enum
  value in a data statement in the same upgrade**: Postgres rejects a
  not-yet-committed `ALTER TYPE … ADD VALUE` ("unsafe use of new value" — this
  crash-looped a live instance once). Cast the column instead
  (`col::text IN (…)`), or split the add and the use across releases.
- Migrations aren't exercised by `pytest` (it builds the schema with
  `create_all`), so before shipping one run `alembic upgrade head` against
  **both** a fresh empty database and a copy at the previous release tag.
- **Upgrades must be self-diagnosing, never crash-looping.** The startup/upgrade
  path should preflight the DB's current revision against head; when a plain
  `alembic upgrade head` can't run cleanly (a breaking or multi-step change), it
  must fail fast and print an ordered, copy-pasteable upgrade for the admin to
  run by hand (e.g. `alembic upgrade <rev>` → optional data step →
  `alembic upgrade head`, plus how to verify) rather than restart-looping. Put
  the same steps in that release's `CHANGELOG.md` entry.

## Product language

- The D in DOCENT stands for **Distributed** (not "Decentralized").
- Users are **communicators**, not "researchers".
- Use the phrases **"Reach out"** and **"Broad Impact"** in user-facing copy.
- No email-based features (notifications, self-service password reset) — the
  admin-mediated flows are deliberate.

## Outward-facing materials

Anything outward-facing — social posts, slides, posters, one-pagers, web or
artifact pages, README imagery — follows `design/BRAND.md`: palette, type,
layout, motion, and copy voice, all derived from `frontend/src/theme.ts` and
`design/logo/`. Reuse the app's animation by linking
`design/logo/LogoReveal.css`; never redraw or retime it. Rendered assets are
not committed — only their sources and the guide.

## Privacy invariants

- Reports and the public `/impact` page must never include private fields:
  descriptions, reflections, ratings, host contact details/notes, or (for the
  public page) communicator identities.
- Registration always requires the access code; never add an open-signup path.
- `.env` is git-ignored; never commit secrets.

## Versioning

Keep these in step when cutting a release: `backend/app/main.py` (FastAPI
version), `frontend/package.json`, `CITATION.cff`, and `CHANGELOG.md` — then
**tag the release commit** `vX.Y.Z`. The app footer shows the version from git
(the tag when the commit is tagged, otherwise the short commit hash), injected
at build time by `frontend/vite.config.ts`, so there's no hardcoded version in
`Layout.tsx` to bump.
