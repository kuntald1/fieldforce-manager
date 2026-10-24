from datetime import datetime

from sqlalchemy import Integer, Float, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DeviationAlert(Base):
    """
    Fired when an agent's live GPS position drifts beyond a threshold
    distance from the planned route (e.g. the "cinema instead of ABC
    Traders" scenario). Coarse-grained by design — see the earlier
    accuracy discussion — a few hundred metres of tolerance is fine here.
    """
    __tablename__ = "deviation_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    daily_route_id: Mapped[int | None] = mapped_column(ForeignKey("daily_routes.id", ondelete="SET NULL"), nullable=True)

    distance_from_route_m: Mapped[float] = mapped_column(Float, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    daily_route = relationship("DailyRoute", back_populates="deviation_alerts")
