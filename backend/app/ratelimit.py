"""A tiny in-process rate limiter for auth endpoints.

Good enough for a single-instance community deployment (no Redis). Used as a
FastAPI dependency; disabled in tests via settings.rate_limit_enabled.

Two layers guard login. The per-IP limit stops one client hammering the
endpoint. The per-account limit counts *failed* sign-ins against the email
being tried, so a guesser who rotates addresses (a botnet, or a proxy that
forwards a spoofed client IP) still gets only a handful of tries per account.
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.config import get_settings

# Above this many tracked keys, drop the ones whose window has fully expired so
# a scan from many addresses can't grow the table without bound.
_PRUNE_ABOVE = 10_000


def client_ip(request: Request) -> str:
    """The client address as resolved by the bundled nginx.

    nginx works out the real client (believing X-Forwarded-For only from
    private-range proxies) and passes it as X-Real-IP, overwriting anything the
    client sent. We deliberately don't read X-Forwarded-For here: its first hop
    is whatever the client typed.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _fresh(self, key: str, now: float) -> deque[float]:
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        return hits

    def _prune(self, now: float) -> None:
        if len(self._hits) <= _PRUNE_ABOVE:
            return
        for key in [
            k for k, h in self._hits.items() if not h or now - h[-1] > self.window_seconds
        ]:
            del self._hits[key]

    def check(self, key: str) -> None:
        """Raise 429 if `key` has used up its attempts; doesn't count one."""
        if not get_settings().rate_limit_enabled:
            return
        now = time.monotonic()
        hits = self._fresh(key, now)
        if len(hits) >= self.max_attempts:
            retry_after = int(self.window_seconds - (now - hits[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts — please wait and try again.",
                headers={"Retry-After": str(retry_after)},
            )

    def record(self, key: str) -> None:
        """Count one attempt against `key`."""
        if not get_settings().rate_limit_enabled:
            return
        now = time.monotonic()
        self._prune(now)
        self._fresh(key, now).append(now)

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)

    def __call__(self, request: Request) -> None:
        key = client_ip(request)
        self.check(key)
        self.record(key)


# Login is hammered by brute force; registration by spam signups.
login_rate_limit = RateLimiter(max_attempts=10, window_seconds=300)   # 10 / 5 min
register_rate_limit = RateLimiter(max_attempts=5, window_seconds=3600)  # 5 / hour
# Failed sign-ins per account, whatever address they come from. Cleared by a
# successful login, so it only ever delays someone who keeps getting it wrong.
login_failure_limit = RateLimiter(max_attempts=10, window_seconds=900)  # 10 / 15 min
