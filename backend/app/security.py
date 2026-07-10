from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Request, Response
from pwdlib import PasswordHash

from app.config import get_settings

COOKIE_NAME = "docent_token"
ALGORITHM = "HS256"

_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _hasher.verify(password, password_hash)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.access_token_days)
    return jwt.encode(
        {"sub": str(user_id), "exp": expires},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> int | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None


def _resolve_secure(request: Request | None) -> bool:
    """Decide whether the auth cookie should carry the Secure flag.

    COOKIE_SECURE may be "true"/"false" to force it, or "auto" (default) to
    match the actual connection: a Secure cookie is only sent back over HTTPS,
    so forcing it on a plain-HTTP deployment silently breaks login. In auto mode
    we trust the reverse proxy's X-Forwarded-Proto, falling back to the request
    scheme. Booleans are also accepted (used in tests).
    """
    setting = get_settings().cookie_secure
    if isinstance(setting, bool):
        return setting
    value = str(setting).strip().lower()
    if value in {"true", "1", "yes"}:
        return True
    if value in {"false", "0", "no"}:
        return False
    if request is None:
        return False
    forwarded = request.headers.get("x-forwarded-proto")
    scheme = forwarded.split(",")[0].strip() if forwarded else request.url.scheme
    return scheme == "https"


def set_auth_cookie(response: Response, token: str, request: Request | None = None) -> None:
    settings = get_settings()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.access_token_days * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=_resolve_secure(request),
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")
