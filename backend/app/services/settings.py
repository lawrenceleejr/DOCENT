"""Runtime settings stored in the DB, with env-var fallback.

An admin can change these from the UI without editing `.env` or redeploying.
The DB value wins when a row exists (even if empty — e.g. clearing the invite
code closes registration); otherwise we fall back to the env-configured value.
"""
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Setting

INVITE_CODE_KEY = "invite_code"
CONTACT_EMAIL_KEY = "contact_email"
SITE_URL_KEY = "site_url"
SITE_NAME_KEY = "site_name"
PUBLIC_PAGE_KEY = "public_page"
LOGIN_MESSAGE_KEY = "login_message"


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
