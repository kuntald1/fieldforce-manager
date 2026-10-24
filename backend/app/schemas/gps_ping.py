from datetime import datetime

from pydantic import BaseModel, ConfigDict


class GpsPingCreate(BaseModel):
    latitude: float
    longitude: float
    speed_kmh: float | None = None
    recorded_at: datetime | None = None  # defaults to server time if the device doesn't send one


class GpsPingAck(BaseModel):
    """Deliberately minimal — this endpoint gets hit every 30-60s, keep the response light."""
    recorded: bool
    deviation_detected: bool


class LiveAgentPosition(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    agent_id: int
    latitude: float
    longitude: float
    speed_kmh: float | None
    recorded_at: datetime


class PingHistoryPoint(BaseModel):
    agent_id: int
    latitude: float
    longitude: float
    speed_kmh: float | None
    recorded_at: datetime
    deviating: bool | None  # None when that day has no planned route to compare against
    leg_geometry: dict | None = None     # road-snapped path from the PREVIOUS point to this one
    leg_distance_m: float | None = None  # actual road distance for that leg, when OSRM could compute it


class DeviationAlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_id: int
    daily_route_id: int | None
    distance_from_route_m: float
    detected_at: datetime
    resolved: bool
    resolved_at: datetime | None
    notes: str | None


class ResolveDeviationRequest(BaseModel):
    notes: str | None = None
