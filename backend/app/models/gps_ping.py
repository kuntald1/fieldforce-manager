from datetime import datetime

from sqlalchemy import BigInteger, Integer, Float, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GpsPing(Base):
    """
    One location sample sent by the agent app roughly every 30-60s while
    on duty. This is the highest-volume table in the system — kept
    deliberately narrow (no relationships loaded eagerly) so inserts stay
    cheap at scale. Consider partitioning by recorded_at month once volume
    grows past a few million rows (see dev-environment notes on manual
    ALTER TABLE — SQLAlchemy create_all() won't set this up for you).
    """
    __tablename__ = "gps_pings"
    __table_args__ = (
        Index("ix_gps_pings_agent_time", "agent_id", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    speed_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)

    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
