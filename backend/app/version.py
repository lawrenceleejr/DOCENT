"""The user-facing app version — the same value the web footer shows (#26).

Resolution mirrors frontend/vite.config.ts: an explicit APP_VERSION wins (the
Docker image bakes it in at build time, since the image has no .git), otherwise
the git tag when HEAD is exactly tagged, else the short commit hash, else "dev"
when git isn't available at all.
"""
from functools import lru_cache
from pathlib import Path
from subprocess import run

from app.config import get_settings

_REPO_DIR = Path(__file__).resolve().parent


def _git(*args: str) -> str:
    result = run(
        ["git", *args], capture_output=True, text=True, check=True, cwd=_REPO_DIR
    )
    return result.stdout.strip()


@lru_cache
def app_version() -> str:
    configured = get_settings().app_version
    if configured:
        return configured
    try:
        return _git("describe", "--tags", "--exact-match")
    except Exception:
        pass  # HEAD isn't tagged — fall through to the commit hash
    try:
        return _git("rev-parse", "--short", "HEAD")
    except Exception:
        pass  # no git available (e.g. a container without .git)
    return "dev"
