from datetime import date as date_type, datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.gps_ping import GpsPing
from app.models.route import DailyRoute
from app.models.deviation_alert import DeviationAlert
from app.models.organization import Organization
from app.models.attendance import AttendanceSession
from app.models.enums import AttendanceStatus
from app.core.deps import require_role
from app.core.geo import distance_to_route_m
from app.core.osrm import route_through_waypoints
from app.config import settings
from app.schemas.auth import CurrentUser
from app.schemas.gps_ping import GpsPingCreate, GpsPingAck, LiveAgentPosition, PingHistoryPoint

router = APIRouter()


@router.post("", response_model=GpsPingAck)
def ingest_ping(
    payload: GpsPingCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    """
    Called every 30-60s by the agent app while on duty — independent of
    check-in/check-out, per the earlier discussion (this keeps running
    even if the agent skips check-in entirely, which is what lets a
    deviation alert fire for a missed visit).
    """
    recorded_at = payload.recorded_at or datetime.now(timezone.utc)

    db.add(GpsPing(
        organization_id=current_user.organization_id,
        agent_id=current_user.user_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        speed_kmh=payload.speed_kmh,
        recorded_at=recorded_at,
    ))

    deviation_detected = False

    today = recorded_at.date()
    route = (
        db.query(DailyRoute)
        .filter(
            DailyRoute.organization_id == current_user.organization_id,
            DailyRoute.agent_id == current_user.user_id,
            DailyRoute.route_date == today,
        )
        .first()
    )

    if route and route.route_geometry:
        coordinates = route.route_geometry.get("coordinates", [])
        distance_m = distance_to_route_m(payload.latitude, payload.longitude, coordinates)

        org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
        deviation_threshold_m = org.deviation_threshold_m if org else settings.DEVIATION_THRESHOLD_M

        if distance_m > deviation_threshold_m:
            deviation_detected = True

            last_alert = (
                db.query(DeviationAlert)
                .filter(
                    DeviationAlert.organization_id == current_user.organization_id,
                    DeviationAlert.agent_id == current_user.user_id,
                    DeviationAlert.daily_route_id == route.id,
                    DeviationAlert.resolved == False,  # noqa: E712
                )
                .order_by(DeviationAlert.detected_at.desc())
                .first()
            )

            cooldown_elapsed = (
                last_alert is None
                or (recorded_at - last_alert.detected_at).total_seconds() / 60 > settings.DEVIATION_ALERT_COOLDOWN_MIN
            )

            if cooldown_elapsed:
                db.add(DeviationAlert(
                    organization_id=current_user.organization_id,
                    agent_id=current_user.user_id,
                    daily_route_id=route.id,
                    distance_from_route_m=round(distance_m, 1),
                    detected_at=recorded_at,
                ))

    db.commit()
    return GpsPingAck(recorded=True, deviation_detected=deviation_detected)


@router.get("/live", response_model=list[LiveAgentPosition])
def live_positions(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager", "agent")),
):
    """
    Latest known position, but ONLY for agents on an open (on_duty)
    attendance session right now — not just "whoever's most recent GPS
    ping happens to be newest." That used to leave someone showing as
    on-duty forever after their last-ever ping, no matter how long ago
    they'd actually logged out. Logging out now removes them from this
    list immediately, regardless of how old or recent their last ping is.

    Admin/manager see the whole org (the live-tracking map); an agent
    calling this only ever gets their OWN position back — never
    teammates' — regardless of anything the frontend might try to pass.
    DISTINCT ON is Postgres-specific — fine, since that's our only target DB.
    """
    on_duty_agent_ids = (
        db.query(AttendanceSession.agent_id)
        .filter(
            AttendanceSession.organization_id == current_user.organization_id,
            AttendanceSession.status == AttendanceStatus.on_duty,
        )
        .distinct()
    )

    query = db.query(GpsPing).filter(
        GpsPing.organization_id == current_user.organization_id,
        GpsPing.agent_id.in_(on_duty_agent_ids),
    )
    if current_user.role == "agent":
        query = query.filter(GpsPing.agent_id == current_user.user_id)
    rows = query.distinct(GpsPing.agent_id).order_by(GpsPing.agent_id, GpsPing.recorded_at.desc()).all()
    return rows


@router.get("/history", response_model=list[PingHistoryPoint])
def ping_history(
    agent_id: int,
    date: date_type | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager", "agent")),
):
    """
    Every ping for one agent on one day, in order — lets the frontend draw
    the agent's actual travelled path (not just their latest point) and
    color each segment by whether that point was off the planned route,
    using the same distance_to_route_m check as live deviation detection
    (one source of truth, not duplicated in JS).
    Defaults to today if no date is given. An agent can only ever request
    their OWN history — any other agent_id they pass is overridden.
    """
    if current_user.role == "agent":
        agent_id = current_user.user_id

    target_date = date or datetime.now(timezone.utc).date()

    rows = (
        db.query(GpsPing)
        .filter(
            GpsPing.organization_id == current_user.organization_id,
            GpsPing.agent_id == agent_id,
            func.date(GpsPing.recorded_at) == target_date,
        )
        .order_by(GpsPing.recorded_at)
        .all()
    )

    route = (
        db.query(DailyRoute)
        .filter(
            DailyRoute.organization_id == current_user.organization_id,
            DailyRoute.agent_id == agent_id,
            DailyRoute.route_date == target_date,
        )
        .first()
    )
    route_coords = route.route_geometry.get("coordinates", []) if route and route.route_geometry else None

    deviation_threshold_m = settings.DEVIATION_THRESHOLD_M
    if route_coords:
        org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
        if org:
            deviation_threshold_m = org.deviation_threshold_m

    points = []
    for p in rows:
        deviating = None
        if route_coords:
            distance_m = distance_to_route_m(p.latitude, p.longitude, route_coords)
            deviating = distance_m > deviation_threshold_m
        points.append(PingHistoryPoint(
            agent_id=p.agent_id,
            latitude=p.latitude,
            longitude=p.longitude,
            speed_kmh=p.speed_kmh,
            recorded_at=p.recorded_at,
            deviating=deviating,
        ))

    # Snap each consecutive pair to real roads (one OSRM call for the whole
    # day, not one per leg) so the actual-path line on the map follows
    # streets instead of cutting straight lines between raw GPS samples.
    if len(points) >= 2:
        legs = route_through_waypoints([(pt.latitude, pt.longitude) for pt in points])
        for i, leg in enumerate(legs):
            points[i + 1].leg_geometry = leg["geometry"]
            points[i + 1].leg_distance_m = leg["distance_m"]

    return points
