from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.travel_allowance import TravelAllowanceRequest
from app.models.route import DailyRoute
from app.models.gps_ping import GpsPing
from app.models.organization import Organization
from app.models.enums import ApprovalStatus
from app.core.deps import get_current_user, require_role
from app.core.geo import haversine_distance_m
from app.core.osrm import route_through_waypoints
from app.schemas.auth import CurrentUser
from app.schemas.travel_allowance import TravelAllowanceReview, TravelAllowanceOut

router = APIRouter()


def _compute_actual_km(db: Session, agent_id: int, route_date) -> float:
    """
    Same approach as GET /api/gps-pings/history: road-snap consecutive
    pings via OSRM where possible, falling back to straight-line only for
    a leg OSRM couldn't match — not duplicated logic, just not exposed as
    its own endpoint since nothing else needed a bare total before this.
    """
    pings = (
        db.query(GpsPing)
        .filter(GpsPing.agent_id == agent_id, func.date(GpsPing.recorded_at) == route_date)
        .order_by(GpsPing.recorded_at)
        .all()
    )
    if len(pings) < 2:
        return 0.0

    coords = [(p.latitude, p.longitude) for p in pings]
    legs = route_through_waypoints(coords)
    total_m = 0.0
    for i, leg in enumerate(legs):
        if leg["distance_m"] is not None:
            total_m += leg["distance_m"]
        else:
            total_m += haversine_distance_m(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])
    return round(total_m / 1000, 2)


@router.post("/routes/{route_id}/request-ta", response_model=TravelAllowanceOut, status_code=status.HTTP_201_CREATED)
def request_travel_allowance(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    """Flowchart step 12 — agent requests TA for one of their own tasks.
    actual_km is computed here, server-side, from real GPS pings — not
    typed in by the agent — so the request can't simply claim any number."""
    route = (
        db.query(DailyRoute)
        .filter(
            DailyRoute.id == route_id,
            DailyRoute.organization_id == current_user.organization_id,
            DailyRoute.agent_id == current_user.user_id,
        )
        .first()
    )
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    existing_pending = (
        db.query(TravelAllowanceRequest)
        .filter(TravelAllowanceRequest.daily_route_id == route_id, TravelAllowanceRequest.status == ApprovalStatus.pending)
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A TA request for this task is already pending review.")

    actual_km = _compute_actual_km(db, current_user.user_id, route.route_date)

    req = TravelAllowanceRequest(
        organization_id=current_user.organization_id,
        daily_route_id=route_id,
        agent_id=current_user.user_id,
        planned_km=route.planned_distance_km,
        actual_km=actual_km,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.get("/travel-allowances", response_model=list[TravelAllowanceOut])
def list_travel_allowances(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Same self-scoping pattern as every other list endpoint — agent
    sees only their own, admin/manager see the whole org."""
    query = db.query(TravelAllowanceRequest).filter(TravelAllowanceRequest.organization_id == current_user.organization_id)
    if current_user.role == "agent":
        query = query.filter(TravelAllowanceRequest.agent_id == current_user.user_id)
    if status_filter is not None:
        query = query.filter(TravelAllowanceRequest.status == status_filter)
    return query.order_by(TravelAllowanceRequest.created_at.desc()).all()


def _get_pending_ta(db: Session, current_user: CurrentUser, request_id: int) -> TravelAllowanceRequest:
    req = (
        db.query(TravelAllowanceRequest)
        .filter(TravelAllowanceRequest.id == request_id, TravelAllowanceRequest.organization_id == current_user.organization_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.status != ApprovalStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"This request was already {req.status.value}.")
    return req


@router.post("/travel-allowances/{request_id}/approve", response_model=TravelAllowanceOut)
def approve_travel_allowance(
    request_id: int,
    payload: TravelAllowanceReview,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    """Approve at actual_km (payload.approved_km omitted) or MODIFY the
    km being paid out (payload.approved_km set to a different number) —
    both are "approve," just with a different approved_km; flowchart
    treats modify as a form of approval, not a separate status."""
    req = _get_pending_ta(db, current_user, request_id)
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()

    approved_km = payload.approved_km if payload.approved_km is not None else req.actual_km
    if approved_km < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="approved_km can't be negative")

    req.status = ApprovalStatus.approved
    req.approved_km = approved_km
    req.rate_per_km = org.km_rate
    req.amount = round(approved_km * org.km_rate, 2)
    req.reviewed_by = current_user.user_id
    req.reviewer_notes = payload.notes
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return req


@router.post("/travel-allowances/{request_id}/reject", response_model=TravelAllowanceOut)
def reject_travel_allowance(
    request_id: int,
    payload: TravelAllowanceReview,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    req = _get_pending_ta(db, current_user, request_id)
    req.status = ApprovalStatus.rejected
    req.reviewed_by = current_user.user_id
    req.reviewer_notes = payload.notes
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return req
