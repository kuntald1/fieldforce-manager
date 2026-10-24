from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CheckOutRequest(BaseModel):
    visit_notes: str | None = None


class VisitDetailsUpdate(BaseModel):
    """The optional extras an agent can add to a stop: what they wrote
    down, and when they agreed to come back. Sent separately from the
    check-in because the app lets them be filled in afterwards, and
    because a check-in must never fail over an optional field."""

    visit_notes: str | None = Field(default=None, max_length=4000)
    next_meeting_at: datetime | None = None
    # True clears the date instead of leaving it alone — without this
    # there is no way to undo a next meeting, since None already means
    # "not supplied".
    clear_next_meeting: bool = False


class VisitAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    url: str | None
    size_bytes: int | None
    duration_seconds: int | None
    created_at: datetime
    expires_at: datetime | None
    # The file is gone, but the row says it was here. The UI shows a
    # placeholder rather than a broken image.
    purged_at: datetime | None


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    daily_route_id: int | None
    customer_id: int
    agent_id: int
    sequence_order: int | None
    status: str
    check_in_time: datetime | None
    check_in_distance_m: float | None
    check_in_photo_url: str | None
    check_out_time: datetime | None
    visit_notes: str | None
    next_meeting_at: datetime | None = None
    created_at: datetime


class VisitHistoryOut(BaseModel):
    """One past visit as the customer-history screens show it: who went,
    when, what they wrote, what they attached, and when they said they
    would return."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    customer_name: str | None = None
    agent_id: int
    agent_name: str | None = None
    daily_route_id: int | None
    status: str
    check_in_time: datetime | None
    check_in_distance_m: float | None
    # The single pre-attachments check-in photo, so visits recorded before
    # the attachments table still show their evidence.
    check_in_photo_url: str | None
    visit_notes: str | None
    next_meeting_at: datetime | None
    attachments: list[VisitAttachmentOut] = []


class ScheduledMeetingOut(BaseModel):
    """A next-meeting date somebody set, as the upcoming list shows it."""

    visit_id: int
    customer_id: int
    customer_name: str
    agent_id: int
    agent_name: str
    next_meeting_at: datetime
    # Which visit the promise was made on, so the manager can open it.
    visited_on: datetime | None
    visit_notes: str | None
