from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Database ---
    DATABASE_URL: str = "postgresql+psycopg2://fieldforce:fieldforce_db@postgres:5432/fieldforce_db"

    # --- Auth ---
    SECRET_KEY: str = "change-this-in-.env"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12 hours — a field agent's shift

    # --- App ---
    PROJECT_NAME: str = "FieldForce Manager API"
    ENVIRONMENT: str = "development"

    # --- Defaults used by business logic ---
    DEFAULT_GEOFENCE_RADIUS_M: int = 100  # matches the "GEO Radius: 100m" in the mockups

    # --- Mapbox ---
    MAPBOX_SECRET_TOKEN: str = ""  # used server-side only, for Permanent Geocoding API calls

    # --- OSRM ---
    OSRM_BASE_URL: str = "http://osrm:5000"  # internal docker network address, not the host-mapped port

    # --- Uploads ---
    UPLOAD_DIR: str = "uploads/visit_photos"  # relative to the backend container's working directory

    # --- Deviation detection ---
    DEVIATION_THRESHOLD_M: int = 500   # distance from planned route before it's flagged
    DEVIATION_ALERT_COOLDOWN_MIN: int = 10  # don't re-alert for the same ongoing deviation more often than this

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
