from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import AttendanceStatus


class AttendanceSession(Base):
    """
    One on-duty shift — starts at login, ends at logout. GPS tracking
    (gps_pings) runs for the whole span of an open session regardless of
    whether the agent checks in to any visit, which is what lets a
    deviation alert fire even if check-in is skipped entirely.
    """
    __tablename__ = "attendance_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    login_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    logout_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[AttendanceStatus] = mapped_column(SAEnum(AttendanceStatus, name="attendance_status"), default=AttendanceStatus.on_duty)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
