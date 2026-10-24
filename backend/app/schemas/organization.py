from pydantic import BaseModel, ConfigDict


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    km_rate: float
    deviation_threshold_m: int
    default_geofence_radius_m: int
    ta_tolerance_percent: float
    # Read by the mobile app so the optional details section knows how
    # many photos it may offer and how long it may record for. Read-only
    # here: these are set by the superadmin per company, not by the
    # company's own admin, so they are absent from OrganizationUpdate.
    max_visit_photos: int
    max_audio_seconds: int


class OrganizationUpdate(BaseModel):
    km_rate: float | None = None
    deviation_threshold_m: int | None = None
    default_geofence_radius_m: int | None = None
    ta_tolerance_percent: float | None = None
