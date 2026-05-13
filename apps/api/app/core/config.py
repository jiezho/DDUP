from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "DDUP API"
    environment: str = "dev"
    database_url: str = "postgresql+psycopg://ddup:ddup@localhost:5432/ddup"

    ddup_wiki_enabled: bool = False
    ddup_wiki_vault_path: str = ""
    ddup_wiki_raw_dir: str = "_raw"

    hermes_api_base: str = ""
    hermes_api_key: str = ""
    hermes_model: str = "hermes-agent"

    storage_endpoint: str = ""
    storage_bucket: str = ""
    storage_access_key: str = ""
    storage_secret_key: str = ""
    storage_region: str = "us-east-1"
    storage_secure: bool = False

    ddup_path: str = ""


settings = Settings()

