from datetime import datetime

from sqlalchemy import String, Boolean, Float, Integer, DateTime, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import MediaRetention


class Organization(Base):
    """
    A paying client company (multi-tenant root).
    Every other table hangs off organization_id so one client's data
    never leaks into another's — this is the tenant isolation boundary.
    """
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    subscription_plan: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Travel Allowance reimbursement rate, currency per km. Admin-editable;
    # snapshotted onto each TravelAllowanceRequest at approval time so a
    # later rate change never retroactively alters an already-approved amount.
    km_rate: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    # Previously hardcoded in config.py (DEVIATION_THRESHOLD_M,
    # DEFAULT_GEOFENCE_RADIUS_M) — now per-org and admin-editable instead
    # of a code-wide constant every client was stuck with.
    deviation_threshold_m: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    default_geofence_radius_m: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    # How far above the planned distance an actual trip can run before a TA
    # request is worth a manager's attention. Actual is ALWAYS a bit above
    # planned — OSRM plans the shortest legal path, while a real agent meets
    # traffic, one-ways, parking and the occasional missed turn — so a bare
    # "actual > planned" flag would light up on every single request and be
    # ignored within a week. This is the line between "normal day" and
    # "worth opening Live Tracking for".
    ta_tolerance_percent: Mapped[float] = mapped_column(Float, default=20.0, nullable=False)

    # --- What an agent may attach to a visit, and for how long it is kept.
    # Per company rather than global: a pharma rep photographing shelf
    # displays wants several pictures and no voice note, while a service
    # engineer wants the customer describing the fault out loud. Both are
    # paying for the same software.
    max_visit_photos: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    max_audio_seconds: Mapped[int] = mapped_column(Integer, default=180, nullable=False)
    # Media is by far the heaviest thing this system stores — a photo is
    # 300x a GPS ping and a voice note 2,000x — so how long it is kept
    # decides when a server fills up. See scripts/purge_media.py.
    media_retention: Mapped[MediaRetention] = mapped_column(
        SAEnum(MediaRetention, name="media_retention"), default=MediaRetention.never, nullable=False
    )
    photo_retention_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    audio_retention_months: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    customers = relationship("Customer", back_populates="organization", cascade="all, delete-orphan")
