from datetime import date as date_type

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.dashboard import DashboardSummary
from app.models.visit import Visit
from app.models.route import DailyRoute
from app.models.deviation_alert import DeviationAlert
from app.models.attendance import AttendanceSession
from app.models.travel_allowance import TravelAllowanceRequest
from app.models.expense import Expense
from app.models.user import User
from app.models.enums import VisitStatus, ApprovalStatus, ExpenseStatus, AttendanceStatus, UserRole

router = APIRouter()


def _today() -> date_type:
    return date_type.today()


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    date: date_type | None = None,
    agent_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    One dashboard endpoint for both Agent and Admin/Manager web pages —
    same self-scoping pattern as every other list/report endpoint: an
    agent is always forced to their own data, admin/manager see the
    whole organization (optionally narrowed to one agent via agent_id).

    visit_status and deviations are for the selected date (default
    today); ta_status and expense_status are all-time totals, since a
    single day's approval volume is usually too sparse to be a useful
    dashboard snapshot on its own. attendance is "right now" (who
    currently has an open on-duty session), not date-filtered.
    """
    target_date = date or _today()
    is_agent = current_user.role == "agent"
    effective_agent_id = current_user.user_id if is_agent else agent_id

    # ---- Visit status breakdown (for the selected date) ----
    visit_query = (
        db.query(Visit.status, func.count(Visit.id))
        .join(DailyRoute, Visit.daily_route_id == DailyRoute.id)
        .filter(DailyRoute.organization_id == current_user.organization_id, DailyRoute.route_date == target_date)
    )
    if effective_agent_id is not None:
        visit_query = visit_query.filter(Visit.agent_id == effective_agent_id)
    visit_counts = {status: 0 for status in VisitStatus}
    for status_value, count in visit_query.group_by(Visit.status).all():
        visit_counts[status_value] = count

    # ---- Deviation summary (for the selected date) ----
    deviation_query = db.query(DeviationAlert.resolved, func.count(DeviationAlert.id)).filter(
        DeviationAlert.organization_id == current_user.organization_id,
        func.date(DeviationAlert.detected_at) == target_date,
    )
    if effective_agent_id is not None:
        deviation_query = deviation_query.filter(DeviationAlert.agent_id == effective_agent_id)
    resolved_count = 0
    unresolved_count = 0
    for resolved_flag, count in deviation_query.group_by(DeviationAlert.resolved).all():
        if resolved_flag:
            resolved_count = count
        else:
            unresolved_count = count

    # ---- Attendance: on duty right now vs off duty, among this
    # organization's agents (or just the one selected/self-scoped agent) ----
    agents_query = db.query(User.id).filter(User.organization_id == current_user.organization_id, User.role == UserRole.agent)
    if effective_agent_id is not None:
        agents_query = agents_query.filter(User.id == effective_agent_id)
    agent_ids = [row[0] for row in agents_query.all()]

    on_duty_agent_ids = set()
    if agent_ids:
        open_sessions = (
            db.query(AttendanceSession.agent_id)
            .filter(
                AttendanceSession.organization_id == current_user.organization_id,
                AttendanceSession.agent_id.in_(agent_ids),
                AttendanceSession.status == AttendanceStatus.on_duty,
            )
            .distinct()
            .all()
        )
        on_duty_agent_ids = {row[0] for row in open_sessions}
    on_duty_count = len(on_duty_agent_ids)
    off_duty_count = len(agent_ids) - on_duty_count

    # ---- TA / Expense approval status (all-time totals) ----
    ta_query = db.query(TravelAllowanceRequest.status, func.count(TravelAllowanceRequest.id)).filter(
        TravelAllowanceRequest.organization_id == current_user.organization_id
    )
    if effective_agent_id is not None:
        ta_query = ta_query.filter(TravelAllowanceRequest.agent_id == effective_agent_id)
    ta_counts = {status: 0 for status in ApprovalStatus}
    for status_value, count in ta_query.group_by(TravelAllowanceRequest.status).all():
        ta_counts[status_value] = count

    expense_query = db.query(Expense.status, func.count(Expense.id)).filter(
        Expense.organization_id == current_user.organization_id
    )
    if effective_agent_id is not None:
        expense_query = expense_query.filter(Expense.agent_id == effective_agent_id)
    expense_counts = {status: 0 for status in ExpenseStatus}
    for status_value, count in expense_query.group_by(Expense.status).all():
        expense_counts[status_value] = count

    return DashboardSummary(
        date=target_date,
        visit_status={
            "pending": visit_counts[VisitStatus.pending],
            "checked_in": visit_counts[VisitStatus.checked_in],
            "completed": visit_counts[VisitStatus.completed],
            "missed": visit_counts[VisitStatus.missed],
        },
        deviations={"resolved": resolved_count, "unresolved": unresolved_count},
        attendance={"on_duty": on_duty_count, "off_duty": off_duty_count},
        ta_status={
            "pending": ta_counts[ApprovalStatus.pending],
            "approved": ta_counts[ApprovalStatus.approved],
            "rejected": ta_counts[ApprovalStatus.rejected],
        },
        expense_status={
            "pending": expense_counts[ExpenseStatus.pending],
            "approved": expense_counts[ExpenseStatus.approved],
            "rejected": expense_counts[ExpenseStatus.rejected],
        },
    )
