from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://docent:docent@localhost:5432/docent"
    secret_key: str = "dev-secret-do-not-use-in-production"
    invite_code: str = ""
    access_token_days: int = 7
    cookie_secure: bool = True
    overpass_url: str = "https://overpass-api.de/api/interpreter"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
