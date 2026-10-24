from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class RouteCreateRequest(BaseModel):
    agent_id: int
    route_date: date
    start_latitude: float   # e.g. the office location
    start_longitude: float
    start_location_name: str | None = None  # e.g. "Office" — shown instead of the raw address where space is tight
    customer_ids: list[int]  # order doesn't matter — OSRM decides the optimal sequence
    roundtrip: bool = True   # True: return to start_latitude/longitude at the end
    priority: str = "medium"  # "low" | "medium" | "high" — a label across tasks, not a stop-order control


class RouteVisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    sequence_order: int | None
    status: str
    # Was already on the Visit model, just never exposed before — the
    # actual arrival time once checked in. There's no equivalent
    # "scheduled time per stop" feature yet (Visit.scheduled_time exists
    # on the model but nothing sets it anywhere), so pending stops
    # legitimately have no time to show — not omitted by mistake.
    check_in_time: datetime | None


class RouteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_id: int
    route_date: date
    start_location_name: str | None
    planned_distance_km: float | None
    planned_onward_distance_km: float | None  # "Up" — start to the last stop
    planned_return_distance_km: float | None  # "Down" — last stop back to start (null if not a roundtrip)
    planned_duration_min: int | None
    status: str
    priority: str
    waypoint_order: list[int] | None
    route_geometry: dict | None  # GeoJSON LineString — needed to draw the planned route on a map
    visits: list[RouteVisitOut] = []
