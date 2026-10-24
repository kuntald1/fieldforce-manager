from datetime import datetime

from sqlalchemy import (
    Integer, Float, String, Text, DateTime, ForeignKey, func, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import VisitStatus


class Visit(Base):
    """
    One stop on an agent's route — the unit that gets checked in/out.
    check_in_distance_m is stored (not just pass/fail) so a manager can
    later review borderline cases where GPS drift made the geofence
    check ambiguous.
    """
    __tablename__ = "visits"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    daily_route_id: Mapped[int | None] = mapped_column(ForeignKey("daily_routes.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    sequence_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scheduled_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[VisitStatus] = mapped_column(SAEnum(VisitStatus, name="visit_status"), default=VisitStatus.pending)

    # --- Check-in evidence (geofence + photo, per the earlier discussion) ---
    check_in_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    check_in_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_in_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_in_distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_in_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    check_out_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # What the agent wrote about this stop. Filled from the optional
    # details section in the app rather than only at check-out, which the
    # mobile app never calls.
    visit_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # When the agent agreed to come back. The one field here that points
    # forward instead of recording what happened, which is why the
    # Scheduled Meetings screen can exist at all.
    next_meeting_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    daily_route = relationship("DailyRoute", back_populates="visits")
    attachments = relationship(
        "VisitAttachment", back_populates="visit", cascade="all, delete-orphan", order_by="VisitAttachment.created_at"
    )
    expenses = relationship("Expense", back_populates="visit")
