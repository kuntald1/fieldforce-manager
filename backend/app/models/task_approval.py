from datetime import datetime

from sqlalchemy import Integer, Text, DateTime, ForeignKey, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ApprovalStatus


class TaskApprovalRequest(Base):
    """
    An agent's "this task ended with unvisited stops — please review"
    request (flowchart step 8-9). One route can have more than one of
    these over time if re-requested, so this is its own table rather
    than a single status field on DailyRoute — keeps the full history,
    not just the latest decision.
    """
    __tablename__ = "task_approval_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    daily_route_id: Mapped[int] = mapped_column(ForeignKey("daily_routes.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    reason: Mapped[str] = mapped_column(Text, nullable=False)  # the agent's own explanation
    status: Mapped[ApprovalStatus] = mapped_column(
        SAEnum(ApprovalStatus, name="approval_status"), default=ApprovalStatus.pending, nullable=False
    )

    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    daily_route = relationship("DailyRoute")
