"""
The customer's side of the record.

Everything else in this system is organised around the agent and the
task: who went where, how far, what it cost. This router turns that
round and asks the question a sales manager actually asks — "what has
been happening with THIS customer" — which the same data answers once it
is read along a different axis.

Two endpoints, one screen:
  - what has been promised and not yet done (upcoming next meetings)
  - what has already happened at one customer, with the evidence
"""
from datetime import date as date_type, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.visit import Visit
from app.models.customer import Customer
from app.models.user import User
from app.models.enums import VisitStatus
from app.core.deps import require_role
from app.schemas.auth import CurrentUser
from app.schemas.visit import ScheduledMeetingOut, VisitHistoryOut

router = APIRouter()


def _names(db: Session, customer_ids, agent_ids) -> tuple[dict, dict]:
    customers = {}
    agents = {}
    if customer_ids:
        for c in db.query(Customer).filter(Customer.id.in_(customer_ids)).all():
            customers[c.id] = c.name
    if agent_ids:
        for u in db.query(User).filter(User.id.in_(agent_ids)).all():
            agents[u.id] = u.name
    return customers, agents


@router.get("/scheduled", response_model=list[ScheduledMeetingOut])
def scheduled_meetings(
    start_date: date_type | None = None,
    end_date: date_type | None = None,
    customer_id: int | None = None,
    agent_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager", "agent")),
):
    """
    Next meetings an agent wrote down, soonest first.

    Defaults to everything still ahead rather than everything ever: a
    promise kept last March is history, and history is what the other
    endpoint is for. Pass start_date to look back deliberately.
    """
    query = db.query(Visit).filter(
        Visit.organization_id == current_user.organization_id,
        Visit.next_meeting_at.isnot(None),
    )

    if start_date is not None:
        query = query.filter(Visit.next_meeting_at >= datetime.combine(start_date, time.min, tzinfo=timezone.utc))
    else:
        query = query.filter(Visit.next_meeting_at >= datetime.now(timezone.utc))
    if end_date is not None:
        query = query.filter(Visit.next_meeting_at <= datetime.combine(end_date, time.max, tzinfo=timezone.utc))
    if customer_id is not None:
        query = query.filter(Visit.customer_id == customer_id)

    # An agent only ever sees their own, same as every other list here.
    if current_user.role == "agent":
        query = query.filter(Visit.agent_id == current_user.user_id)
    elif agent_id is not None:
        query = query.filter(Visit.agent_id == agent_id)

    visits = query.order_by(Visit.next_meeting_at).all()
    customers, agents = _names(db, {v.customer_id for v in visits}, {v.agent_id for v in visits})

    return [
        ScheduledMeetingOut(
            visit_id=v.id,
            customer_id=v.customer_id,
            customer_name=customers.get(v.customer_id, "Unknown"),
            agent_id=v.agent_id,
            agent_name=agents.get(v.agent_id, "Unknown"),
            next_meeting_at=v.next_meeting_at,
            visited_on=v.check_in_time,
            visit_notes=v.visit_notes,
        )
        for v in visits
    ]


@router.get("/history", response_model=list[VisitHistoryOut])
def customer_history(
    customer_id: int,
    start_date: date_type | None = None,
    end_date: date_type | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager", "agent")),
):
    """
    Everything that happened at one customer, newest first, with the
    photos, the voice note and whatever the agent wrote.

    Only visits that were actually reached: a stop that was planned and
    missed says nothing about the customer, and mixing the two would make
    "we have been there six times" mean nothing.
    """
    customer = (
        db.query(Customer)
        .filter(Customer.id == customer_id, Customer.organization_id == current_user.organization_id)
        .first()
    )
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    query = (
        db.query(Visit)
        .options(selectinload(Visit.attachments))
        .filter(
            Visit.organization_id == current_user.organization_id,
            Visit.customer_id == customer_id,
            Visit.status.in_([VisitStatus.checked_in, VisitStatus.completed]),
        )
    )
    if start_date is not None:
        query = query.filter(Visit.check_in_time >= datetime.combine(start_date, time.min, tzinfo=timezone.utc))
    if end_date is not None:
        query = query.filter(Visit.check_in_time <= datetime.combine(end_date, time.max, tzinfo=timezone.utc))
    if current_user.role == "agent":
        query = query.filter(Visit.agent_id == current_user.user_id)

    visits = query.order_by(Visit.check_in_time.desc().nullslast()).all()
    _, agents = _names(db, set(), {v.agent_id for v in visits})

    out = []
    for v in visits:
        item = VisitHistoryOut.model_validate(v)
        item.customer_name = customer.name
        item.agent_name = agents.get(v.agent_id, "Unknown")
        out.append(item)
    return out
