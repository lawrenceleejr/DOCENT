# Contributing to DOCENT

Thanks for helping researchers **Reach out** and document their **Broad Impact**.
Contributions of all kinds are welcome — bug reports, features, docs, and
deployment recipes.

## Ways to help

- **Report a bug or request a feature** — open an issue. Include steps to
  reproduce, what you expected, and what happened (screenshots help).
- **Improve docs** — the README, `SECURITY.md`, and deployment guides.
- **Send code** — see the workflow below.
- **Report a security issue** — privately, per [SECURITY.md](SECURITY.md); please
  don't open a public issue for vulnerabilities.

## Project layout

```
backend/     FastAPI + SQLAlchemy + Alembic (Python 3.12)
frontend/    React + TypeScript + Vite + Mantine
docker/      backup sidecar image
scripts/     start/stop/backup/restore helpers
```

## Local development

You need Docker (for Postgres) plus Python 3.12 and Node 22.

```bash
# 1. Postgres for dev
docker compose -f docker-compose.dev.yml up -d db

# 2. Backend (http://localhost:8000)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e '.[test]'
export DATABASE_URL=postgresql+psycopg://docent:docent@localhost:5432/docent
export SECRET_KEY=$(openssl rand -hex 32) INVITE_CODE=dev
alembic upgrade head
uvicorn app.main:app --reload

# 3. Frontend (http://localhost:5173, proxies /api → :8000)
cd frontend
npm install
npm run dev
```

Or run the whole stack the way it ships: `./scripts/start.sh`.

## Tests & checks (please run before a PR)

```bash
# Backend — pytest against a real Postgres (never SQLite; stats use date_trunc)
cd backend && pytest -q

# Frontend — type-check + production build
cd frontend && npm run build
```

CI runs the same on every push/PR. Add or update tests for behavior you change;
new backend endpoints should have tests under `backend/tests/`.

## Database changes

Schema changes need an Alembic migration in `backend/alembic/versions/`
(hand-written to match the existing style). Postgres **native enums** must be
created explicitly before an `add_column` that uses them — see the existing
migrations for the pattern. The entrypoint runs `alembic upgrade head` on start.

## Pull requests

1. Branch from the latest default branch.
2. Keep PRs focused; write a clear description of the change and why.
3. Ensure `pytest` and `npm run build` pass, and update docs/`CHANGELOG.md`
   when behavior changes.
4. Match the surrounding code style (Ruff-ish Python; the existing React/TS
   conventions). Keep comments about *why*, not *what*.

## Conventions

- Never put secrets in the repo; `.env` is git-ignored.
- Dates are `YYYY-MM-DD` strings end-to-end (no timezone-shifted datetimes).
- Auth is an HttpOnly cookie — never localStorage.

## License

DOCENT is licensed under the **GNU GPL v3**. By contributing, you agree that your
contributions are licensed under the same terms. See [LICENSE](LICENSE).
