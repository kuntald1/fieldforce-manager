from datetime import datetime

from sqlalchemy import Float, Text, DateTime, ForeignKey, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ApprovalStatus


class TravelAllowanceRequest(Base):
    """
    Flowchart step 12: planned vs actual km for one task, employee
    requests reimbursement, manager approves/modifies/rejects, amount is
    approved_km * the org's km_rate AT THAT TIME (snapshotted onto
    rate_per_km so a later rate change never rewrites history).
    """
    __tablename__ = "travel_allowance_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    daily_route_id: Mapped[int] = mapped_column(ForeignKey("daily_routes.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # Snapshotted at request time — the route's own fields can't silently
    # drift out from under an already-submitted claim.
    planned_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_km: Mapped[float] = mapped_column(Float, nullable=False)  # computed server-side from real GPS pings, not typed by the agent

    status: Mapped[ApprovalStatus] = mapped_column(
        SAEnum(ApprovalStatus, name="ta_approval_status"), default=ApprovalStatus.pending, nullable=False
    )

    # Set only once reviewed. approved_km defaults to actual_km unless the
    # manager explicitly modifies it (flowchart's "Approve / Reject / Modify").
    approved_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    rate_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)

    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    daily_route = relationship("DailyRoute")
