from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.task_approval import TaskApprovalRequest
from app.models.route import DailyRoute
from app.models.enums import ApprovalStatus
from app.core.deps import get_current_user, require_role
from app.schemas.auth import CurrentUser
from app.schemas.task_approval import TaskApprovalCreate, TaskApprovalReview, TaskApprovalOut

router = APIRouter()


@router.post("/routes/{route_id}/request-approval", response_model=TaskApprovalOut, status_code=status.HTTP_201_CREATED)
def request_approval(
    route_id: int,
    payload: TaskApprovalCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    """
    Flowchart step 8: "task not completed → employee sends request for
    approval." Agent-only, and only for their OWN route — there's no
    agent_id override here the way list endpoints have one, because this
    isn't a filter, it's who the request is FROM.
    """
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
        db.query(TaskApprovalRequest)
        .filter(TaskApprovalRequest.daily_route_id == route_id, TaskApprovalRequest.status == ApprovalStatus.pending)
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A request for this task is already pending review.")

    req = TaskApprovalRequest(
        organization_id=current_user.organization_id,
        daily_route_id=route_id,
        agent_id=current_user.user_id,
        reason=payload.reason,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.get("/task-approvals", response_model=list[TaskApprovalOut])
def list_task_approvals(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Admin/manager see the whole org's requests; an agent only ever
    sees their own — same self-scoping pattern as the other list endpoints."""
    query = db.query(TaskApprovalRequest).filter(TaskApprovalRequest.organization_id == current_user.organization_id)
    if current_user.role == "agent":
        query = query.filter(TaskApprovalRequest.agent_id == current_user.user_id)
    if status_filter is not None:
        query = query.filter(TaskApprovalRequest.status == status_filter)
    return query.order_by(TaskApprovalRequest.created_at.desc()).all()


@router.post("/task-approvals/{request_id}/approve", response_model=TaskApprovalOut)
def approve_task(
    request_id: int,
    payload: TaskApprovalReview,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    req = _get_pending_request(db, current_user, request_id)
    req.status = ApprovalStatus.approved
    req.reviewed_by = current_user.user_id
    req.reviewer_notes = payload.notes
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return req


@router.post("/task-approvals/{request_id}/reject", response_model=TaskApprovalOut)
def reject_task(
    request_id: int,
    payload: TaskApprovalReview,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    req = _get_pending_request(db, current_user, request_id)
    req.status = ApprovalStatus.rejected
    req.reviewed_by = current_user.user_id
    req.reviewer_notes = payload.notes
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return req


def _get_pending_request(db: Session, current_user: CurrentUser, request_id: int) -> TaskApprovalRequest:
    req = (
        db.query(TaskApprovalRequest)
        .filter(TaskApprovalRequest.id == request_id, TaskApprovalRequest.organization_id == current_user.organization_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.status != ApprovalStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"This request was already {req.status.value}.")
    return req
