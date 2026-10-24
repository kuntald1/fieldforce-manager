from datetime import datetime, date

from sqlalchemy import (
    Integer, Float, String, Date, DateTime, ForeignKey, func, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import RouteStatus, RoutePriority


class DailyRoute(Base):
    """
    One agent's planned route for one day — the output of the "Optimize"
    button (OSRM route-optimization call). waypoint_order and
    route_geometry are stored as JSON so the frontend can redraw the exact
    planned path on the map without recomputing it.
    """
    __tablename__ = "daily_routes"
    # NOTE: an agent can now have more than one task on the same
    # route_date — each is its own independent row, so there is no longer
    # a uniqueness constraint on (agent_id, route_date). See migration
    # that drops uq_agent_route_date.

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    route_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # A human name for the start point (e.g. "Office", "Mani Casadona HQ")
    # — separate from its address/coordinates, since a typed or geocoded
    # address isn't always a meaningful name to show someone. Nullable:
    # routes created before this field existed simply have none.
    start_location_name: Mapped[str | None] = mapped_column(String(150), nullable=True)

    planned_distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    planned_duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Split of planned_distance_km into "Up" (start -> last stop) and "Down"
    # (last stop -> start, only when the route returns to start). For a
    # roundtrip, planned_distance_km == planned_onward_distance_km +
    # planned_return_distance_km. For a one-way route, planned_return_distance_km
    # is null and planned_onward_distance_km == planned_distance_km. Null on
    # routes created before this field existed.
    planned_onward_distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    planned_return_distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Ordered list of customer_ids, e.g. [12, 7, 19, 3] — the OSRM-optimized visit sequence.
    waypoint_order: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # GeoJSON LineString geometry returned by OSRM, drawn directly on the Mapbox map.
    route_geometry: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    status: Mapped[RouteStatus] = mapped_column(
        SAEnum(RouteStatus, name="route_status"), default=RouteStatus.planned
    )
    # A label across MULTIPLE tasks (e.g. sorting today's 5 agents' tasks
    # by urgency) — unrelated to stop order WITHIN one task, which still
    # comes entirely from OSRM's own distance optimization, untouched.
    priority: Mapped[RoutePriority] = mapped_column(
        SAEnum(RoutePriority, name="route_priority"), default=RoutePriority.medium, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    visits = relationship("Visit", back_populates="daily_route")
    deviation_alerts = relationship("DeviationAlert", back_populates="daily_route")
