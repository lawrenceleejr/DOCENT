# DOCENT — project conventions for AI assistants

## Workflow

- **README screenshots**: after pushing any user-visible feature, regenerate the
  screenshots in `docs/screenshots/` (same filenames) from a running instance
  seeded with `./scripts/seed-demo.sh`, and commit them with the feature. The
  README's images must always reflect the current UI.
- All work happens on the designated feature branch; never push elsewhere.
- Run `cd backend && pytest` (against real Postgres — never SQLite) and
  `cd frontend && npm run build` before every commit that touches code.
- Schema changes need a hand-written Alembic migration in
  `backend/alembic/versions/` (create native enums explicitly before use).

## Product language

- The D in DOCENT stands for **Distributed** (not "Decentralized").
- Users are **communicators**, not "researchers".
- Use the phrases **"Reach out"** and **"Broad Impact"** in user-facing copy.
- No email-based features (notifications, self-service password reset) — the
  admin-mediated flows are deliberate.

## Privacy invariants

- Reports and the public `/impact` page must never include private fields:
  descriptions, reflections, ratings, host contact details/notes, or (for the
  public page) communicator identities.
- Registration always requires the access code; never add an open-signup path.
- `.env` is git-ignored; never commit secrets.

## Versioning

Keep these in step when cutting a release: `backend/app/main.py` (FastAPI
version), `frontend/package.json`, `APP_VERSION` in
`frontend/src/components/Layout.tsx`, `CITATION.cff`, and `CHANGELOG.md`.
