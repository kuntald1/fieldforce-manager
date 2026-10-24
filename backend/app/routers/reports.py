from datetime import date as date_type

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.route import DailyRoute
from app.models.visit import Visit
from app.models.deviation_alert import DeviationAlert
from app.models.travel_allowance import TravelAllowanceRequest
from app.models.task_approval import TaskApprovalRequest
from app.models.expense import Expense
from app.models.customer import Customer
from app.models.enums import VisitStatus, ApprovalStatus, ExpenseStatus
from app.core.deps import require_role
from app.schemas.auth import CurrentUser
from app.schemas.report import AgentDailySummary, AgentFinanceSummary, DeviationHistoryItem, CustomerVisitFrequency
from app.routers.travel_allowance import _compute_actual_km  # one source of truth for "actual km from real GPS pings"

router = APIRouter()


@router.get("/agent-summary", response_model=list[AgentDailySummary])
def agent_summary_report(
    start_date: date_type,
    end_date: date_type,
    agent_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager", "agent")),
):
    """
    One row per (agent, date) that actually had a planned task in range —
    no zero-filled rows for days nothing was assigned. Note: this calls
    OSRM once per route (via _compute_actual_km) to get real actual km,
    same as a single TA request does — fine for a normal date range, but
    a very wide range × many agents means that many OSRM calls; worth
    revisiting (caching, or a lighter estimate) if this report ends up
    covering months at once rather than days/weeks.

    Also doubles as the agent's own "my date-range report" in the mobile
    app — same self-scoping pattern as every other list endpoint: an
    agent is always forced to their own agent_id (the ?agent_id= override
    is for admin/manager only), never sees anyone else's rows.
    """
    query = db.query(DailyRoute).filter(
        DailyRoute.organization_id == current_user.organization_id,
        DailyRoute.route_date >= start_date,
        DailyRoute.route_date <= end_date,
    )
    if current_user.role == "agent":
        query = query.filter(DailyRoute.agent_id == current_user.user_id)
    elif agent_id is not None:
        query = query.filter(DailyRoute.agent_id == agent_id)
    routes = query.order_by(DailyRoute.route_date.desc()).all()

    results = []
    for route in routes:
        visits = db.query(Visit).filter(Visit.daily_route_id == route.id).all()
        visits_completed = sum(1 for v in visits if v.status in (VisitStatus.completed, VisitStatus.checked_in))
        deviation_count = db.query(DeviationAlert).filter(DeviationAlert.daily_route_id == route.id).count()
        actual_km = _compute_actual_km(db, route.agent_id, route.route_date)

        # Latest of each (a route can be re-requested after a rejection,
        # so take the most recent one rather than the first/any) —
        # None stays None when the agent never requested either one,
        # which the web/mobile UI shows as "—" rather than "Rejected".
        latest_approval = (
            db.query(TaskApprovalRequest)
            .filter(TaskApprovalRequest.daily_route_id == route.id)
            .order_by(TaskApprovalRequest.created_at.desc())
            .first()
        )
        latest_ta = (
            db.query(TravelAllowanceRequest)
            .filter(TravelAllowanceRequest.daily_route_id == route.id)
            .order_by(TravelAllowanceRequest.created_at.desc())
            .first()
        )

        results.append(
            AgentDailySummary(
                agent_id=route.agent_id,
                date=route.route_date,
                planned_km=route.planned_distance_km,
                actual_km=actual_km,
                visits_total=len(route.waypoint_order or []),
                visits_completed=visits_completed,
                deviation_count=deviation_count,
                approval_status=latest_approval.status.value if latest_approval else None,
                ta_status=latest_ta.status.value if latest_ta else None,
                ta_claimed_km=latest_ta.actual_km if latest_ta else None,
                ta_approved_km=latest_ta.approved_km if latest_ta else None,
                ta_amount=latest_ta.amount if latest_ta else None,
            )
        )
    return results


@router.get("/ta-expense-summary", response_model=list[AgentFinanceSummary])
def ta_expense_summary_report(
    start_date: date_type,
    end_date: date_type,
    agent_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    """Approved amounts only — pending/rejected don't count as real spend."""
    ta_query = (
        db.query(TravelAllowanceRequest)
        .join(DailyRoute, TravelAllowanceRequest.daily_route_id == DailyRoute.id)
        .filter(
            TravelAllowanceRequest.organization_id == current_user.organization_id,
            TravelAllowanceRequest.status == ApprovalStatus.approved,
            DailyRoute.route_date >= start_date,
            DailyRoute.route_date <= end_date,
        )
    )
    expense_query = db.query(Expense).filter(
        Expense.organization_id == current_user.organization_id,
        Expense.status == ExpenseStatus.approved,
        Expense.expense_date >= start_date,
        Expense.expense_date <= end_date,
    )
    if agent_id is not None:
        ta_query = ta_query.filter(TravelAllowanceRequest.agent_id == agent_id)
        expense_query = expense_query.filter(Expense.agent_id == agent_id)

    totals: dict[int, dict[str, float]] = {}
    for r in ta_query.all():
        bucket = totals.setdefault(r.agent_id, {"ta": 0.0, "exp": 0.0})
        bucket["ta"] += r.amount or 0.0
    for e in expense_query.all():
        bucket = totals.setdefault(e.agent_id, {"ta": 0.0, "exp": 0.0})
        bucket["exp"] += float(e.amount)

    return [
        AgentFinanceSummary(
            agent_id=aid,
            total_ta_amount=round(v["ta"], 2),
            total_expense_amount=round(v["exp"], 2),
            total_combined=round(v["ta"] + v["exp"], 2),
        )
        for aid, v in totals.items()
    ]


@router.get("/deviation-history", response_model=list[DeviationHistoryItem])
def deviation_history_report(
    start_date: date_type,
    end_date: date_type,
    agent_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    query = db.query(DeviationAlert).filter(
        DeviationAlert.organization_id == current_user.organization_id,
        func.date(DeviationAlert.detected_at) >= start_date,
        func.date(DeviationAlert.detected_at) <= end_date,
    )
    if agent_id is not None:
        query = query.filter(DeviationAlert.agent_id == agent_id)
    return query.order_by(DeviationAlert.detected_at.desc()).all()


@router.get("/customer-visit-frequency", response_model=list[CustomerVisitFrequency])
def customer_visit_frequency_report(
    start_date: date_type,
    end_date: date_type,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    rows = (
        db.query(Visit.customer_id, func.count(Visit.id).label("visit_count"))
        .join(DailyRoute, Visit.daily_route_id == DailyRoute.id)
        .filter(
            Visit.organization_id == current_user.organization_id,
            DailyRoute.route_date >= start_date,
            DailyRoute.route_date <= end_date,
        )
        .group_by(Visit.customer_id)
        .order_by(func.count(Visit.id).desc())
        .all()
    )
    customer_ids = [r.customer_id for r in rows]
    names = {}
    if customer_ids:
        names = {c.id: c.name for c in db.query(Customer).filter(Customer.id.in_(customer_ids)).all()}

    return [
        CustomerVisitFrequency(customer_id=r.customer_id, customer_name=names.get(r.customer_id, "Unknown"), visit_count=r.visit_count)
        for r in rows
    ]
