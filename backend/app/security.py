import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Request, Response
from pwdlib import PasswordHash

from app.config import get_settings

COOKIE_NAME = "docent_token"
ALGORITHM = "HS256"

_hasher = PasswordHash.recommended()

# A throwaway hash verified when a login names an unknown email, so that path
# costs the same Argon2 work as a wrong password for a real account — otherwise
# response timing reveals which emails have accounts.
_DUMMY_HASH = _hasher.hash(secrets.token_hex(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _hasher.verify(password, password_hash)


def dummy_verify_password() -> None:
    """Burn the same time as a real (failing) password check."""
    _hasher.verify("not-the-password", _DUMMY_HASH)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        # iat lets a password change revoke every earlier session (tokens
        # issued before the change are rejected in get_current_user).
        {"sub": str(user_id), "iat": now, "exp": now + timedelta(days=settings.access_token_days)},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> tuple[int, int | None] | None:
    """Return (user_id, issued_at_epoch_seconds) for a valid token, else None.

    issued_at is None for tokens minted before iat existed; those are treated
    as pre-dating any password change.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        iat = payload.get("iat")
        return int(payload["sub"]), (int(iat) if iat is not None else None)
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None


def calendar_feed_token(user_id: int) -> str:
    """Signed, non-expiring token that authenticates the read-only calendar
    feed URL (calendar apps can't send cookies). Deterministic per user and
    derived from SECRET_KEY, so rotating the key revokes every feed URL. It
    grants access to nothing but the .ics feed."""
    sig = hmac.new(
        get_settings().secret_key.encode(), f"calfeed:{user_id}".encode(), hashlib.sha256
    ).hexdigest()[:32]
    return f"{user_id}.{sig}"


def verify_calendar_feed_token(token: str) -> int | None:
    """Return the user id for a valid feed token, else None."""
    user_part, _, sig = token.partition(".")
    try:
        user_id = int(user_part)
    except ValueError:
        return None
    expected = calendar_feed_token(user_id)
    return user_id if hmac.compare_digest(token, expected) else None


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
