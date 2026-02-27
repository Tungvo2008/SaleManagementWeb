from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./app.db"
    # Auth (dev defaults). In production set these via .env.
    JWT_SECRET: str = "dev-secret-change-me"
    JWT_ISSUER: str = "warehouse-backend"
    ACCESS_TOKEN_TTL_MINUTES: int = 60
    REFRESH_TOKEN_TTL_DAYS: int = 14
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    COOKIE_DOMAIN: Optional[str] = None
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
