from datetime import date as date_type, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.route import DailyRoute
from app.models.visit import Visit
from app.models.customer import Customer
from app.models.user import User
from app.models.gps_ping import GpsPing
from app.models.enums import RouteStatus, VisitStatus, RoutePriority
from app.core.deps import get_current_user, require_role
from app.core.osrm import optimize_trip
from app.schemas.auth import CurrentUser
from app.schemas.route import RouteCreateRequest, RouteOut

router = APIRouter()


def _validate_and_optimize(db: Session, current_user: CurrentUser, payload: RouteCreateRequest):
    """
    Shared by create and update: validates the agent/customers and runs
    the OSRM call. Raises HTTPException on any problem; otherwise returns
    (agent, optimized_customer_ids, trip).
    """
    if not payload.customer_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customer_ids cannot be empty")

    agent = (
        db.query(User)
        .filter(User.id == payload.agent_id, User.organization_id == current_user.organization_id)
        .first()
    )
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found in this organization")

    # Task Allocation rule: can't assign a task dated before the employee's
    # joining date. Agents with no joining_date set skip the check.
    if agent.joining_date and payload.route_date < agent.joining_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{agent.name} joined on {agent.joining_date}, which is after "
                f"{payload.route_date} — can't assign a task dated before their joining date."
            ),
        )

    customers = (
        db.query(Customer)
        .filter(Customer.id.in_(payload.customer_ids), Customer.organization_id == current_user.organization_id)
        .all()
    )
    customers_by_id = {c.id: c for c in customers}
    missing = set(payload.customer_ids) - customers_by_id.keys()
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customers not found in this organization: {sorted(missing)}",
        )

    coordinates = [(payload.start_latitude, payload.start_longitude)]
    coordinates += [(customers_by_id[cid].latitude, customers_by_id[cid].longitude) for cid in payload.customer_ids]
    trip = optimize_trip(coordinates, roundtrip=payload.roundtrip)
    optimized_customer_ids = [payload.customer_ids[i - 1] for i in trip.order if i != 0]

    return agent, optimized_customer_ids, trip


def _onward_return_split(trip, roundtrip: bool) -> tuple[float | None, float | None]:
    """
    Splits the trip's total distance into "Up" (start -> last stop) and
    "Down" (last stop -> start) using OSRM's per-leg distances, in visit
    order. Only a roundtrip has a return leg — the OSRM /trip response
    always puts it last when roundtrip=true. A one-way route has no "Down"
    at all: the whole distance is "Up".
    """
    legs = trip.leg_distances_km
    if not legs:
        return (trip.distance_km, None) if not roundtrip else (None, None)
    if roundtrip:
        return round(sum(legs[:-1]), 2), round(legs[-1], 2)
    return round(sum(legs), 2), None


def _assert_not_started(db: Session, route: DailyRoute):
    """
    Blocks editing once the journey has actually started — a checked-in
    visit or any GPS ping for that agent/date means real field activity
    (check-in photos, GPS trail) exists, which a silent re-optimize would
    destroy. The flowchart's own "task not completed → approval" workflow
    is the sanctioned way to handle a task that's already underway, not
    mid-flight editing here.
    """
    started_visit = (
        db.query(Visit)
        .filter(Visit.daily_route_id == route.id, Visit.status != VisitStatus.pending)
        .first()
    )
    has_gps_activity = (
        db.query(GpsPing)
        .filter(GpsPing.agent_id == route.agent_id, func.date(GpsPing.recorded_at) == route.route_date)
        .first()
    )
    if started_visit or has_gps_activity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This task has already started — a visit is checked in or GPS "
                "activity exists for this date. It can't be edited; create a "
                "new task instead."
            ),
        )


@router.post("", response_model=RouteOut, status_code=status.HTTP_201_CREATED)
def create_route(
    payload: RouteCreateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    if payload.priority not in {p.value for p in RoutePriority}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"priority must be one of {sorted(p.value for p in RoutePriority)}",
        )

    # An agent can now have more than one task on the same date — each is
    # its own independent DailyRoute with its own priority; the agent sees
    # all of them as a list and works through them in whatever order. So,
    # unlike before, a second task for the same agent/date is not a
    # conflict — no uniqueness check here anymore.
    agent, optimized_customer_ids, trip = _validate_and_optimize(db, current_user, payload)
    onward_km, return_km = _onward_return_split(trip, payload.roundtrip)

    route = DailyRoute(
        organization_id=current_user.organization_id,
        agent_id=payload.agent_id,
        route_date=payload.route_date,
        start_location_name=payload.start_location_name,
        planned_distance_km=round(trip.distance_km, 2),
        planned_onward_distance_km=onward_km,
        planned_return_distance_km=return_km,
        planned_duration_min=round(trip.duration_min),
        waypoint_order=optimized_customer_ids,
        route_geometry=trip.geometry,
        status=RouteStatus.planned,
        priority=RoutePriority(payload.priority),
    )
    db.add(route)
    db.flush()

    for seq, customer_id in enumerate(optimized_customer_ids, start=1):
        db.add(Visit(
            organization_id=current_user.organization_id,
            daily_route_id=route.id,
            customer_id=customer_id,
            agent_id=payload.agent_id,
            sequence_order=seq,
            status=VisitStatus.pending,
        ))

    db.commit()
    db.refresh(route)
    return route


@router.patch("/{route_id}", response_model=RouteOut)
def update_route(
    route_id: int,
    payload: RouteCreateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    route = (
        db.query(DailyRoute)
        .filter(DailyRoute.id == route_id, DailyRoute.organization_id == current_user.organization_id)
        .first()
    )
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    if payload.priority not in {p.value for p in RoutePriority}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"priority must be one of {sorted(p.value for p in RoutePriority)}",
        )

    _assert_not_started(db, route)

    # An agent can have more than one task on the same date now, so
    # changing the agent/date here no longer needs a uniqueness check
    # against other routes.
    agent, optimized_customer_ids, trip = _validate_and_optimize(db, current_user, payload)
    onward_km, return_km = _onward_return_split(trip, payload.roundtrip)

    # All existing visits are still "pending" (guaranteed by _assert_not_started)
    # — safe to replace them wholesale.
    db.query(Visit).filter(Visit.daily_route_id == route.id).delete()

    route.agent_id = payload.agent_id
    route.route_date = payload.route_date
    route.start_location_name = payload.start_location_name
    route.planned_distance_km = round(trip.distance_km, 2)
    route.planned_onward_distance_km = onward_km
    route.planned_return_distance_km = return_km
    route.planned_duration_min = round(trip.duration_min)
    route.waypoint_order = optimized_customer_ids
    route.route_geometry = trip.geometry
    route.priority = RoutePriority(payload.priority)

    for seq, customer_id in enumerate(optimized_customer_ids, start=1):
        db.add(Visit(
            organization_id=current_user.organization_id,
            daily_route_id=route.id,
            customer_id=customer_id,
            agent_id=payload.agent_id,
            sequence_order=seq,
            status=VisitStatus.pending,
        ))

    db.commit()
    db.refresh(route)
    return route


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    """
    Same "not started yet" guard as editing — once there's a real check-in
    or GPS activity for the task, deleting it would throw away genuine
    field evidence, so that has to go through the task-approval flow
    instead of a delete.
    """
    route = (
        db.query(DailyRoute)
        .filter(DailyRoute.id == route_id, DailyRoute.organization_id == current_user.organization_id)
        .first()
    )
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    _assert_not_started(db, route)

    db.query(Visit).filter(Visit.daily_route_id == route.id).delete()
    db.delete(route)
    db.commit()
    return None


@router.post("/{route_id}/start", response_model=RouteOut)
def start_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    """
    Manual stand-in for the agent mobile app's "Start Duty" — which
    doesn't exist yet. Marks the route in_progress AND records one GPS
    ping at the route's start point, since "on duty now" in Live
    Tracking is defined entirely by having a recent ping; without this,
    clicking Start wouldn't actually make the agent show up there.
    """
    route = (
        db.query(DailyRoute)
        .filter(DailyRoute.id == route_id, DailyRoute.organization_id == current_user.organization_id)
        .first()
    )
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    if route.status != RouteStatus.planned:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This task is already '{route.status.value}' — can't start it again.",
        )

    route.status = RouteStatus.in_progress

    if route.route_geometry and route.route_geometry.get("coordinates"):
        lon, lat = route.route_geometry["coordinates"][0]
        db.add(GpsPing(
            organization_id=current_user.organization_id,
            agent_id=route.agent_id,
            latitude=lat,
            longitude=lon,
            recorded_at=datetime.now(timezone.utc),
        ))

    db.commit()
    db.refresh(route)
    return route


@router.post("/{route_id}/end", response_model=RouteOut)
def end_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    """
    Manual stand-in for ending duty. Deliberately does NOT touch any
    visit's status — ending the day isn't the same as claiming every
    stop was completed; whatever's still "pending" stays honestly pending.
    """
    route = (
        db.query(DailyRoute)
        .filter(DailyRoute.id == route_id, DailyRoute.organization_id == current_user.organization_id)
        .first()
    )
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    if route.status != RouteStatus.in_progress:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This task is '{route.status.value}', not in progress — nothing to end.",
        )

    route.status = RouteStatus.completed
    db.commit()
    db.refresh(route)
    return route


@router.get("/{route_id}", response_model=RouteOut)
def get_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    route = (
        db.query(DailyRoute)
        .filter(DailyRoute.id == route_id, DailyRoute.organization_id == current_user.organization_id)
        .first()
    )
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    return route


@router.get("", response_model=list[RouteOut])
def list_routes(
    agent_id: int | None = None,
    route_date: date_type | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = db.query(DailyRoute).filter(DailyRoute.organization_id == current_user.organization_id)
    # Any authenticated role can call this, but an agent only ever sees
    # their own routes — never teammates' — regardless of agent_id passed.
    if current_user.role == "agent":
        agent_id = current_user.user_id
    if agent_id is not None:
        query = query.filter(DailyRoute.agent_id == agent_id)
    if route_date is not None:
        query = query.filter(DailyRoute.route_date == route_date)
    return query.order_by(DailyRoute.route_date.desc()).all()
