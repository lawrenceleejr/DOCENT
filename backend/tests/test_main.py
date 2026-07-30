import pytest

from app.config import get_settings
from app.main import _require_real_postgres_password, _require_real_secret_key


def test_rejects_placeholder_secret_key():
    settings = get_settings()
    original = settings.secret_key
    settings.secret_key = "change-me-openssl-rand-hex-32"
    try:
        with pytest.raises(RuntimeError, match="SECRET_KEY"):
            _require_real_secret_key()
    finally:
        settings.secret_key = original


def test_rejects_placeholder_postgres_password():
    settings = get_settings()
    original = settings.database_url
    settings.database_url = "postgresql+psycopg://docent:change-me@db:5432/docent"
    try:
        with pytest.raises(RuntimeError, match="POSTGRES_PASSWORD"):
            _require_real_postgres_password()
    finally:
        settings.database_url = original


def test_accepts_generated_postgres_password():
    settings = get_settings()
    original = settings.database_url
    settings.database_url = (
        "postgresql+psycopg://docent:9f2ac6e1b7d4c8a03e5f1b6d2c9a7e40@db:5432/docent"
    )
    try:
        _require_real_postgres_password()
    finally:
        settings.database_url = original
