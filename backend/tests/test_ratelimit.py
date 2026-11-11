from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.config import get_settings
from app.ratelimit import RateLimiter, client_ip


def _req(ip="1.2.3.4", forwarded=None, real_ip=None):
    headers = {}
    if forwarded:
        headers["x-forwarded-for"] = forwarded
    if real_ip:
        headers["x-real-ip"] = real_ip
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=ip))


def test_client_ip_uses_proxy_resolved_address():
    # nginx resolves the real client and passes it as X-Real-IP.
    assert client_ip(_req(ip="10.0.0.1", real_ip="203.0.113.9")) == "203.0.113.9"
    assert client_ip(_req(ip="10.0.0.1")) == "10.0.0.1"


def test_client_ip_ignores_client_supplied_forwarded_for():
    # X-Forwarded-For's first hop is whatever the client typed; rotating it
    # must not hand out a fresh rate-limit bucket.
    assert client_ip(_req(ip="10.0.0.1", forwarded="6.6.6.6", real_ip="203.0.113.9")) == (
        "203.0.113.9"
    )
    assert client_ip(_req(ip="10.0.0.1", forwarded="6.6.6.6")) == "10.0.0.1"


def test_failed_logins_lock_the_account_whatever_the_address(client, monkeypatch):
    from app.ratelimit import login_failure_limit

    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    monkeypatch.setattr(login_failure_limit, "max_attempts", 3)
    login_failure_limit.reset("victim@example.com")
    for i in range(3):
        resp = client.post(
            "/api/auth/login",
            json={"email": "victim@example.com", "password": "wrong-guess"},
            headers={"X-Real-IP": f"198.51.100.{i}"},
        )
        assert resp.status_code == 401
    resp = client.post(
        "/api/auth/login",
        json={"email": "victim@example.com", "password": "wrong-guess"},
        headers={"X-Real-IP": "198.51.100.99"},
    )
    assert resp.status_code == 429
    login_failure_limit.reset("victim@example.com")


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
