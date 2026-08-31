"""Runtime settings stored in the DB, with env-var fallback.

An admin can change these from the UI without editing `.env` or redeploying.
The DB value wins when a row exists (even if empty — e.g. clearing the invite
code closes registration); otherwise we fall back to the env-configured value.
"""
import re
import secrets

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Setting
from app.services.basemap import Basemap
from app.services.policies import POLICIES, PolicyDoc

INVITE_CODE_KEY = "invite_code"
CONTACT_EMAIL_KEY = "contact_email"
SITE_URL_KEY = "site_url"
SITE_NAME_KEY = "site_name"
PUBLIC_PAGE_KEY = "public_page"
LOGIN_MESSAGE_KEY = "login_message"
MAP_CENTER_LAT_KEY = "map_center_lat"
MAP_CENTER_LON_KEY = "map_center_lon"
MAP_RADIUS_KM_KEY = "map_radius_km"
BANNER_MESSAGE_KEY = "banner_message"
BANNER_LEVEL_KEY = "banner_level"
BANNER_LEVELS = ("info", "warning", "critical")
USER_DIRECTORY_KEY = "user_directory_visible"
FEDERATION_PUBLISH_KEY = "federation_publish"
FEDERATION_PUBLISH_PLANNED_KEY = "federation_publish_planned"
FEDERATION_TOKEN_KEY = "federation_token"
CF_ANALYTICS_KEY = "cf_analytics_snippet"
BASEMAP_LIGHT_URL_KEY = "basemap_light_url"
BASEMAP_DARK_URL_KEY = "basemap_dark_url"
BASEMAP_ATTRIBUTION_KEY = "basemap_attribution"
BASEMAP_MONOCHROME_KEY = "basemap_monochrome"
POLICY_PRIVACY_KEY = "policy_privacy"
POLICY_TERMS_KEY = "policy_terms"

# The admin pastes the whole Cloudflare Web Analytics snippet
# (<script … data-cf-beacon='{"token":"…"}'></script>) — or just the bare
# token. We only ever pull the token out and inject our own canonical beacon,
# so admin-entered HTML is never echoed back onto the page or the wire.
_CF_TOKEN_RE = re.compile(r"""token["']?\s*:\s*["']([0-9a-fA-F]{6,64})["']""")
_BARE_TOKEN_RE = re.compile(r"^[0-9a-fA-F]{6,64}$")


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


def effective_map_radius_km(db: Session) -> float:
    override = get_setting(db, MAP_RADIUS_KM_KEY)
    return float(override) if override is not None else get_settings().map_radius_km


def effective_banner_message(db: Session) -> str:
    override = get_setting(db, BANNER_MESSAGE_KEY)
    return override if override is not None else get_settings().banner_message


def effective_banner_level(db: Session) -> str:
    override = get_setting(db, BANNER_LEVEL_KEY)
    level = override if override is not None else get_settings().banner_level
    return level if level in BANNER_LEVELS else "info"


def effective_basemap(db: Session) -> Basemap:
    """The tile sources both the web map and the PDF report draw on.

    An empty dark URL is meaningful (reuse the light tiles and invert), so the
    usual "DB row wins even when empty" rule applies to every field here.
    """
    settings = get_settings()

    def value(key: str, fallback: str) -> str:
        override = get_setting(db, key)
        return override if override is not None else fallback

    monochrome = get_setting(db, BASEMAP_MONOCHROME_KEY)
    return Basemap(
        light_url=value(BASEMAP_LIGHT_URL_KEY, settings.basemap_light_url),
        dark_url=value(BASEMAP_DARK_URL_KEY, settings.basemap_dark_url),
        attribution=value(BASEMAP_ATTRIBUTION_KEY, settings.basemap_attribution),
        monochrome=(
            monochrome == "1" if monochrome is not None else settings.basemap_monochrome
        ),
    )


def policy_body(db: Session, doc: PolicyDoc) -> str:
    """The published markdown for one document, or "" when unpublished.

    There is no env fallback and the shipped example is deliberately not the
    default: an unreviewed template served as a real policy would state
    retention periods and rights nobody has checked.
    """
    return get_setting(db, doc.setting_key) or ""


def published_policy_slugs(db: Session) -> list[str]:
    """Slugs with something published, so the UI links only what exists."""
    return [doc.slug for doc in POLICIES if policy_body(db, doc)]


def user_directory_visible(db: Session) -> bool:
    override = get_setting(db, USER_DIRECTORY_KEY)
    if override is not None:
        return override == "1"
    return get_settings().user_directory_visible


def federation_publish_enabled(db: Session) -> bool:
    """Whether this instance serves its activities feed to sibling instances."""
    return get_setting(db, FEDERATION_PUBLISH_KEY) == "1"


def federation_publish_planned_enabled(db: Session) -> bool:
    """Whether the feed also includes planned (upcoming) events so siblings can
    see them on their Schedule. Off by default — planned events are tentative."""
    return get_setting(db, FEDERATION_PUBLISH_PLANNED_KEY) == "1"


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


def federation_feed_url(db: Session) -> str:
    """The full, token-bearing feed URL an admin copies for siblings — empty
    until publishing is enabled. If the instance's site URL isn't set, the
    result is host-relative (the admin still needs to set the site URL)."""
    if not federation_publish_enabled(db):
        return ""
    token = get_federation_token(db)
    if not token:
        return ""
    base = (effective_site_url(db) or "").rstrip("/")
    return f"{base}/api/federation/activities?token={token}"


def effective_cf_analytics_snippet(db: Session) -> str:
    """The raw Cloudflare Web Analytics snippet the admin pasted (empty if
    unset). Stored verbatim so the admin form round-trips what they entered."""
    return get_setting(db, CF_ANALYTICS_KEY) or ""


def cf_analytics_token(db: Session) -> str | None:
    """The Cloudflare beacon token parsed from the stored snippet, or None when
    nothing usable is configured. Only the token is ever exposed publicly (and
    injected) — never the raw HTML the admin pasted."""
    snippet = (get_setting(db, CF_ANALYTICS_KEY) or "").strip()
    if not snippet:
        return None
    match = _CF_TOKEN_RE.search(snippet)
    if match:
        return match.group(1)
    if _BARE_TOKEN_RE.match(snippet):
        return snippet
    return None
