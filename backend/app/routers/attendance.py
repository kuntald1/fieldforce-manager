from datetime import date as date_type, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.attendance import AttendanceSession
from app.models.enums import AttendanceStatus
from app.core.deps import get_current_user, require_role
from app.schemas.auth import CurrentUser
from app.schemas.attendance import AttendanceOut

router = APIRouter()


@router.post("/login", response_model=AttendanceOut, status_code=status.HTTP_201_CREATED)
def attendance_login(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    """
    Agent-only, self-service — unlike Start/End Task (which only
    admin/manager can do, since there's no agent app to trigger it from),
    attendance login/logout is the agent acting on their OWN record via
    their own web session, so no admin stand-in is needed here.
    Multiple sessions per day are fine (e.g. a lunch break out/in) — what
    isn't allowed is logging in while already on an OPEN session.
    """
    already_open = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.organization_id == current_user.organization_id,
            AttendanceSession.agent_id == current_user.user_id,
            AttendanceSession.status == AttendanceStatus.on_duty,
        )
        .first()
    )
    if already_open:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already on duty — log out first.")

    session = AttendanceSession(
        organization_id=current_user.organization_id,
        agent_id=current_user.user_id,
        login_time=datetime.now(timezone.utc),
        status=AttendanceStatus.on_duty,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/logout", response_model=AttendanceOut)
def attendance_logout(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    session = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.organization_id == current_user.organization_id,
            AttendanceSession.agent_id == current_user.user_id,
            AttendanceSession.status == AttendanceStatus.on_duty,
        )
        .order_by(AttendanceSession.login_time.desc())
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not currently on duty.")

    session.logout_time = datetime.now(timezone.utc)
    session.status = AttendanceStatus.off_duty
    db.commit()
    db.refresh(session)
    return session


@router.get("/current", response_model=AttendanceOut | None)
def current_attendance(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    """Null if not currently on duty — lets the frontend show the right
    toggle state without listing full history just to check."""
    return (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.organization_id == current_user.organization_id,
            AttendanceSession.agent_id == current_user.user_id,
            AttendanceSession.status == AttendanceStatus.on_duty,
        )
        .order_by(AttendanceSession.login_time.desc())
        .first()
    )


@router.get("", response_model=list[AttendanceOut])
def list_attendance(
    agent_id: int | None = None,
    date: date_type | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Same self-scoping pattern as every other list endpoint — agent
    sees only their own; admin/manager see the org, optionally filtered."""
    query = db.query(AttendanceSession).filter(AttendanceSession.organization_id == current_user.organization_id)
    if current_user.role == "agent":
        query = query.filter(AttendanceSession.agent_id == current_user.user_id)
    elif agent_id is not None:
        query = query.filter(AttendanceSession.agent_id == agent_id)
    if date is not None:
        query = query.filter(func.date(AttendanceSession.login_time) == date)
    return query.order_by(AttendanceSession.login_time.desc()).all()
