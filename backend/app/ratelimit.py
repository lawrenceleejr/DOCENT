"""A tiny in-process, per-IP rate limiter for auth endpoints.

Good enough for a single-instance community deployment (no Redis). Used as a
FastAPI dependency; disabled in tests via settings.rate_limit_enabled.
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.config import get_settings


def client_ip(request: Request) -> str:
    # Behind nginx the real client is the first hop of X-Forwarded-For.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def __call__(self, request: Request) -> None:
        if not get_settings().rate_limit_enabled:
            return
        ip = client_ip(request)
        now = time.monotonic()
        hits = self._hits[ip]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        if len(hits) >= self.max_attempts:
            retry_after = int(self.window_seconds - (now - hits[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts — please wait and try again.",
                headers={"Retry-After": str(retry_after)},
            )
        hits.append(now)


# Login is hammered by brute force; registration by spam signups.
login_rate_limit = RateLimiter(max_attempts=10, window_seconds=300)   # 10 / 5 min
register_rate_limit = RateLimiter(max_attempts=5, window_seconds=3600)  # 5 / hour
