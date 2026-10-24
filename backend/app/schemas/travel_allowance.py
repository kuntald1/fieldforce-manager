from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TravelAllowanceReview(BaseModel):
    approved_km: float | None = None  # omit to approve exactly at actual_km; set to "modify"
    notes: str | None = None


class TravelAllowanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    daily_route_id: int
    agent_id: int
    planned_km: float | None
    actual_km: float
    status: str
    approved_km: float | None
    rate_per_km: float | None
    amount: float | None
    reviewed_by: int | None
    reviewer_notes: str | None
    reviewed_at: datetime | None
    created_at: datetime
