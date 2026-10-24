from datetime import datetime, date

from sqlalchemy import (
    String, Numeric, Text, Date, DateTime, ForeignKey, func, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ExpenseStatus


class Expense(Base):
    """
    Travel/food/misc expense an agent submits, optionally tied to a
    specific visit (per the "Expense Entry" mockup screen).
    """
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id", ondelete="SET NULL"), nullable=True)

    expense_type: Mapped[str] = mapped_column(String(50), nullable=False)  # travel / food / other
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)

    bill_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[ExpenseStatus] = mapped_column(SAEnum(ExpenseStatus, name="expense_status"), default=ExpenseStatus.pending)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    visit = relationship("Visit", back_populates="expenses")
