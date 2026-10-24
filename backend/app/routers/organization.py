from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.organization import Organization
from app.core.deps import require_role, get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.organization import OrganizationOut, OrganizationUpdate

router = APIRouter()


@router.get("", response_model=OrganizationOut)
def get_organization(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Any authenticated role can read it — the Travel Allowance screen
    on either side (agent requesting, manager reviewing) needs km_rate
    to show the computed amount, not just admin."""
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


@router.patch("", response_model=OrganizationOut)
def update_organization(
    payload: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    if payload.km_rate is not None:
        if payload.km_rate < 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="km_rate can't be negative")
        org.km_rate = payload.km_rate
    if payload.deviation_threshold_m is not None:
        if payload.deviation_threshold_m <= 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="deviation_threshold_m must be positive")
        org.deviation_threshold_m = payload.deviation_threshold_m
    if payload.default_geofence_radius_m is not None:
        if payload.default_geofence_radius_m <= 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="default_geofence_radius_m must be positive")
        org.default_geofence_radius_m = payload.default_geofence_radius_m

    db.commit()
    db.refresh(org)
    return org
