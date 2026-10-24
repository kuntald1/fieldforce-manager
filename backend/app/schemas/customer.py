from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CustomerCreate(BaseModel):
    name: str
    address: str
    contact_phone: str | None = None
    geofence_radius_m: int | None = None  # falls back to settings.DEFAULT_GEOFENCE_RADIUS_M if omitted
    # If the frontend already resolved + let the user fine-tune a pin
    # (client-side Temporary geocoding + drag-to-adjust), both must be
    # given together and the backend uses them directly — skipping its
    # own Permanent Geocoding call entirely. This is both more accurate
    # (the user visually confirmed the exact spot) and cheaper (one less
    # billed request). Omit both to fall back to server-side geocoding.
    latitude: float | None = None
    longitude: float | None = None


class CustomerUpdate(BaseModel):
    """
    All fields optional — a manager might only want to rename a customer
    or adjust its geofence radius without re-geocoding. If `address` IS
    given without latitude/longitude, we re-geocode it (see router) since
    the location may have changed; if latitude/longitude ARE given
    alongside it, those win instead (same pin-adjust flow as create).
    """
    name: str | None = None
    address: str | None = None
    contact_phone: str | None = None
    geofence_radius_m: int | None = None
    latitude: float | None = None
    longitude: float | None = None


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str
    latitude: float
    longitude: float
    geofence_radius_m: int
    contact_phone: str | None
    created_at: datetime
