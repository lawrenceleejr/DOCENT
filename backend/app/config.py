from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://docent:docent@localhost:5432/docent"
    secret_key: str = "dev-secret-do-not-use-in-production"
    # An access code is REQUIRED to register. If this is empty, registration is
    # closed entirely (no one can sign up until an admin sets a code).
    invite_code: str = ""
    # Shown on the login/register pages so people know where to request an access
    # code or a password reset. Empty falls back to a generic message.
    contact_email: str = ""
    # Canonical public address of this instance, e.g. https://docent.your-org.edu.
    # Informational: used to generate the DNS / reverse-proxy setup guide in the
    # admin panel. Admins can set it from the UI (DB value overrides this).
    site_url: str = ""
    # Community name shown in the header, on the login page, and on the public
    # impact page (e.g. "UTK Physics Outreach"). Empty = plain DOCENT branding.
    site_name: str = ""
    # Whether the unauthenticated read-only /impact page is served. Default off;
    # admins can flip it from the UI (DB value overrides this).
    public_page: bool = False
    # Optional free-text announcement shown on the login page (e.g. maintenance
    # notices, a welcome blurb). Empty = nothing shown. Admin-editable from the UI.
    login_message: str = ""
    # Where the Map page centers on first load (defaults to Tennessee, this
    # project's original deployment). Admin-editable from the UI.
    map_center_lat: float = 35.86
    map_center_lon: float = -86.36
    access_token_days: int = 7
    # "auto" (default): Secure flag follows the real connection (X-Forwarded-Proto
    # / scheme) so login works on plain http AND https. "true"/"false" force it.
    cookie_secure: str = "auto"
    rate_limit_enabled: bool = True
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    nominatim_url: str = "https://nominatim.openstreetmap.org/search"
    # Photon (komoot) — free, keyless, OSM-based, built for type-ahead search
    # (unlike Nominatim's /search, which isn't meant for per-keystroke queries).
    # Powers the address autocomplete in the new-venue dialog.
    photon_url: str = "https://photon.komoot.io/api"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
