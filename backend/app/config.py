from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://docent:docent@localhost:5432/docent"
    secret_key: str = "dev-secret-do-not-use-in-production"
    invite_code: str = ""
    access_token_days: int = 7
    # "auto" (default): Secure flag follows the real connection (X-Forwarded-Proto
    # / scheme) so login works on plain http AND https. "true"/"false" force it.
    cookie_secure: str = "auto"
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    nominatim_url: str = "https://nominatim.openstreetmap.org/search"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
