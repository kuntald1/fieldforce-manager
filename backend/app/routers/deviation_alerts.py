from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.deviation_alert import DeviationAlert
from app.core.deps import require_role
from app.schemas.auth import CurrentUser
from app.schemas.gps_ping import DeviationAlertOut, ResolveDeviationRequest

router = APIRouter()


@router.get("", response_model=list[DeviationAlertOut])
def list_deviation_alerts(
    agent_id: int | None = None,
    resolved: bool | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager", "agent")),
):
    """Admin/manager see the whole org; an agent only ever sees their own
    alerts — resolving one still stays admin/manager-only below, since
    that's an oversight action, not self-service."""
    query = db.query(DeviationAlert).filter(DeviationAlert.organization_id == current_user.organization_id)
    if current_user.role == "agent":
        agent_id = current_user.user_id
    if agent_id is not None:
        query = query.filter(DeviationAlert.agent_id == agent_id)
    if resolved is not None:
        query = query.filter(DeviationAlert.resolved == resolved)
    return query.order_by(DeviationAlert.detected_at.desc()).all()


@router.post("/{alert_id}/resolve", response_model=DeviationAlertOut)
def resolve_deviation_alert(
    alert_id: int,
    payload: ResolveDeviationRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    alert = (
        db.query(DeviationAlert)
        .filter(DeviationAlert.id == alert_id, DeviationAlert.organization_id == current_user.organization_id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deviation alert not found")

    alert.resolved = True
    alert.resolved_at = datetime.now(timezone.utc)
    if payload.notes is not None:
        alert.notes = payload.notes

    db.commit()
    db.refresh(alert)
    return alert
