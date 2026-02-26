from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./app.db"
    # Auth (dev defaults). In production set these via .env.
    JWT_SECRET: str = "dev-secret-change-me"
    JWT_ISSUER: str = "warehouse-backend"
    ACCESS_TOKEN_TTL_MINUTES: int = 60
    REFRESH_TOKEN_TTL_DAYS: int = 14
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
