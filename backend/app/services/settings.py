"""Runtime settings stored in the DB, with env-var fallback.

An admin can change these from the UI without editing `.env` or redeploying.
The DB value wins when a row exists (even if empty — e.g. clearing the invite
code closes registration); otherwise we fall back to the env-configured value.
"""
import secrets

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Setting

INVITE_CODE_KEY = "invite_code"
CONTACT_EMAIL_KEY = "contact_email"
SITE_URL_KEY = "site_url"
SITE_NAME_KEY = "site_name"
PUBLIC_PAGE_KEY = "public_page"
LOGIN_MESSAGE_KEY = "login_message"
MAP_CENTER_LAT_KEY = "map_center_lat"
MAP_CENTER_LON_KEY = "map_center_lon"
USER_DIRECTORY_KEY = "user_directory_visible"
FEDERATION_PUBLISH_KEY = "federation_publish"
FEDERATION_TOKEN_KEY = "federation_token"


def get_setting(db: Session, key: str) -> str | None:
    row = db.get(Setting, key)
    return row.value if row is not None else None


def set_setting(db: Session, key: str, value: str | None) -> None:
    row = db.get(Setting, key)
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value


def effective_invite_code(db: Session) -> str:
    override = get_setting(db, INVITE_CODE_KEY)
    return override if override is not None else get_settings().invite_code


def effective_contact_email(db: Session) -> str:
    override = get_setting(db, CONTACT_EMAIL_KEY)
    return override if override is not None else get_settings().contact_email


def effective_site_url(db: Session) -> str:
    override = get_setting(db, SITE_URL_KEY)
    return override if override is not None else get_settings().site_url


def effective_site_name(db: Session) -> str:
    override = get_setting(db, SITE_NAME_KEY)
    return override if override is not None else get_settings().site_name


def public_page_enabled(db: Session) -> bool:
    override = get_setting(db, PUBLIC_PAGE_KEY)
    if override is not None:
        return override == "1"
    return get_settings().public_page


def effective_login_message(db: Session) -> str:
    override = get_setting(db, LOGIN_MESSAGE_KEY)
    return override if override is not None else get_settings().login_message


def effective_map_center_lat(db: Session) -> float:
    override = get_setting(db, MAP_CENTER_LAT_KEY)
    return float(override) if override is not None else get_settings().map_center_lat


def effective_map_center_lon(db: Session) -> float:
    override = get_setting(db, MAP_CENTER_LON_KEY)
    return float(override) if override is not None else get_settings().map_center_lon


def user_directory_visible(db: Session) -> bool:
    override = get_setting(db, USER_DIRECTORY_KEY)
    if override is not None:
        return override == "1"
    return get_settings().user_directory_visible


def federation_publish_enabled(db: Session) -> bool:
    """Whether this instance serves its activities feed to sibling instances."""
    return get_setting(db, FEDERATION_PUBLISH_KEY) == "1"


def get_federation_token(db: Session) -> str | None:
    """The token that must appear in the feed URL (pure read; None if unset)."""
    return get_setting(db, FEDERATION_TOKEN_KEY) or None


def ensure_federation_token(db: Session) -> str:
    """Return the existing token, generating (and staging) one if missing so an
    admin can copy a working URL. The caller is responsible for committing."""
    token = get_federation_token(db)
    if not token:
        token = secrets.token_urlsafe(24)
        set_setting(db, FEDERATION_TOKEN_KEY, token)
    return token


def rotate_federation_token(db: Session) -> str:
    """Replace the federation token — invalidates any feed URL already handed
    out to siblings, who must be given the new URL. The caller commits."""
    token = secrets.token_urlsafe(24)
    set_setting(db, FEDERATION_TOKEN_KEY, token)
    return token
