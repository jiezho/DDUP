from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "DDUP API"
    environment: str = "dev"
    database_url: str = "postgresql+psycopg://ddup:ddup@localhost:5432/ddup"


settings = Settings()

