from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.config import get_settings
from app.ratelimit import RateLimiter, client_ip


def _req(ip="1.2.3.4", forwarded=None):
    headers = {"x-forwarded-for": forwarded} if forwarded else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=ip))


def test_client_ip_prefers_forwarded():
    assert client_ip(_req(ip="10.0.0.1", forwarded="203.0.113.9, 10.0.0.1")) == "203.0.113.9"
    assert client_ip(_req(ip="10.0.0.1")) == "10.0.0.1"


def test_rate_limiter_blocks_after_max(monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    limiter = RateLimiter(max_attempts=2, window_seconds=60)
    r = _req()
    limiter(r)  # 1
    limiter(r)  # 2
    with pytest.raises(HTTPException) as exc:
        limiter(r)  # 3 -> blocked
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers


def test_rate_limiter_is_per_ip(monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    limiter = RateLimiter(max_attempts=1, window_seconds=60)
    limiter(_req(ip="1.1.1.1"))
    limiter(_req(ip="2.2.2.2"))  # different IP, not blocked
    with pytest.raises(HTTPException):
        limiter(_req(ip="1.1.1.1"))


def test_rate_limiter_noop_when_disabled(monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", False)
    limiter = RateLimiter(max_attempts=1, window_seconds=60)
    limiter(_req())
    limiter(_req())  # no raise — disabled
