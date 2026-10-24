from datetime import datetime

from sqlalchemy import Integer, String, DateTime, ForeignKey, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import AttachmentKind


class VisitAttachment(Base):
    """
    A photo or a voice note attached to one visit.

    Why a table rather than more columns on Visit: an agent can now add
    several photos to a single stop, and "several" has no fixed number —
    the cap is a per-company setting, so a schema with photo_1_url,
    photo_2_url would have to change every time a client wanted one more.

    Visit.check_in_photo_url stays where it is. It holds the single photo
    taken at check-in on every visit recorded before this table existed,
    and rewriting that history into rows here would mean touching data
    that is already approved and paid against. Anything that lists a
    visit's media reads both.

    expires_at is the whole retention feature, written once at upload
    time from the company's setting rather than worked out later: the
    setting can change, and a photo taken under a three-month rule should
    not silently gain or lose months because someone edited the rule
    afterwards. NULL means keep forever.
    """
    __tablename__ = "visit_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id", ondelete="CASCADE"), index=True)

    kind: Mapped[AttachmentKind] = mapped_column(SAEnum(AttachmentKind, name="attachment_kind"), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Audio only — how long the recording runs. Kept so a list can show
    # "0:42" without opening the file, and so the per-company limit can be
    # checked against what was actually recorded.
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    # Set once the file itself has been removed from disk. The row stays
    # so the visit's history still shows that a photo or recording existed
    # here and when it was taken — a gap with no explanation looks like a
    # bug, which is how people lose trust in a record.
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    visit = relationship("Visit", back_populates="attachments")
