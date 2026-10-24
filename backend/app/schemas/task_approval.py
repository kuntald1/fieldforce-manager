from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TaskApprovalCreate(BaseModel):
    reason: str


class TaskApprovalReview(BaseModel):
    notes: str | None = None


class TaskApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    daily_route_id: int
    agent_id: int
    reason: str
    status: str
    reviewed_by: int | None
    reviewer_notes: str | None
    reviewed_at: datetime | None
    created_at: datetime
