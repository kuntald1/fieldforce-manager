from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MenuItem(Base):
    """
    A navigable section of the app (e.g. "Customers", "Live Tracking").
    Deliberately NOT scoped by organization_id — the set of screens the
    product offers is the same for every client; which ROLES can see a
    given screen is what varies, via MenuRolePermission below.
    """
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)   # e.g. "customers"
    label: Mapped[str] = mapped_column(String(100), nullable=False)             # e.g. "Customers"
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MenuRolePermission(Base):
    """
    Which roles ("admin", "manager", "agent") can see which menu item.
    This is the actual DB-driven permission — the frontend sidebar is
    built from GET /api/menu/my-menu, not a hardcoded role check in React.
    """
    __tablename__ = "menu_role_permissions"
    __table_args__ = (UniqueConstraint("role", "menu_item_id", name="uq_role_menu"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    menu_item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id", ondelete="CASCADE"))

    menu_item = relationship("MenuItem")
