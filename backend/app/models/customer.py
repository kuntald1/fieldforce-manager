from datetime import datetime

from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.config import settings


class Customer(Base):
    """
    A shop/outlet/office a field agent visits — e.g. "ABC Traders" in the
    mockups. latitude/longitude come from geocoding the address once at
    creation time; small inaccuracy here is fine since check-in verification
    uses a radius buffer, not pinpoint matching.
    """
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str] = mapped_column(String(400), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # "GEO Radius: 100m" from the mockups — configurable per customer
    # because a mall kiosk needs a tighter radius than a large warehouse.
    geofence_radius_m: Mapped[int] = mapped_column(Integer, default=settings.DEFAULT_GEOFENCE_RADIUS_M)

    contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="customers")
