"""
Tenant administration — the one part of the API that deliberately works
ACROSS organizations instead of inside one.

Everywhere else, organization_id is a wall: each endpoint filters by the
caller's own, so one client can never see another's data. This router is
where that wall is managed from rather than enforced, so every endpoint
here is superadmin-only, checked explicitly rather than through
require_role("admin") — a client's own admin must never reach it, and
require_role lets a superadmin through admin-level checks, not the
reverse.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.models.enums import UserRole, MediaRetention
from app.core.deps import get_current_user
from app.core.security import hash_password
from app.schemas.auth import CurrentUser
from app.schemas.company import (
    CompanyAdminCreate,
    CompanyCreate,
    CompanyOut,
    CompanyUpdate,
    CompanyUserOut,
)

router = APIRouter()


def require_superadmin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a superadmin can manage companies",
        )
    return current_user


def _assert_email_free(db: Session, email: str) -> None:
    # Email is unique across the WHOLE table, not per company, because it's
    # what someone types to log in — the login form has no company field to
    # disambiguate with.
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email is already in use by another account",
        )


def _with_counts(db: Session, orgs: list[Organization]) -> list[CompanyOut]:
    if not orgs:
        return []
    rows = (
        db.query(User.organization_id, User.role, func.count(User.id))
        .filter(User.organization_id.in_([o.id for o in orgs]))
        .group_by(User.organization_id, User.role)
        .all()
    )
    totals: dict[int, int] = {}
    agents: dict[int, int] = {}
    for org_id, role, count in rows:
        totals[org_id] = totals.get(org_id, 0) + count
        if role == UserRole.agent:
            agents[org_id] = agents.get(org_id, 0) + count

    out = []
    for org in orgs:
        item = CompanyOut.model_validate(org)
        item.media_retention = org.media_retention.value
        item.user_count = totals.get(org.id, 0)
        item.agent_count = agents.get(org.id, 0)
        out.append(item)
    return out


@router.get("", response_model=list[CompanyOut])
def list_companies(db: Session = Depends(get_db), _: CurrentUser = Depends(require_superadmin)):
    orgs = db.query(Organization).order_by(Organization.name).all()
    return _with_counts(db, orgs)


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_superadmin),
):
    """Creates the company and its first admin together — see CompanyCreate."""
    _assert_email_free(db, payload.admin_email)

    org = Organization(
        name=payload.name,
        subscription_plan=payload.subscription_plan,
        km_rate=payload.km_rate,
    )
    db.add(org)
    # Needed before the user below can reference org.id, since nothing is
    # written until the single commit at the end — so a failure while
    # creating the admin rolls the company back too, rather than leaving
    # a company nobody can log into.
    db.flush()

    admin = User(
        organization_id=org.id,
        name=payload.admin_name,
        email=payload.admin_email,
        phone=payload.admin_phone,
        password_hash=hash_password(payload.admin_password),
        role=UserRole.admin,
    )
    db.add(admin)
    db.commit()
    db.refresh(org)
    return _with_counts(db, [org])[0]


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: int,
    payload: CompanyUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_superadmin),
):
    org = db.query(Organization).filter(Organization.id == company_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    if payload.name is not None:
        org.name = payload.name
    if payload.subscription_plan is not None:
        org.subscription_plan = payload.subscription_plan
    if payload.is_active is not None:
        # Deactivating is not deleting: the company's data stays, and its
        # users' own is_active flags are untouched, so reactivating later
        # restores exactly what was there.
        org.is_active = payload.is_active

    # --- media limits and retention ------------------------------------
    # Superadmin-only by being on this router at all: storage is the
    # platform's cost to carry, so the client's own admin cannot raise
    # their photo count or switch their retention off.
    if payload.max_visit_photos is not None:
        org.max_visit_photos = payload.max_visit_photos
    if payload.max_audio_seconds is not None:
        org.max_audio_seconds = payload.max_audio_seconds
    if payload.media_retention is not None:
        try:
            org.media_retention = MediaRetention(payload.media_retention)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="media_retention must be 'automatic' or 'never'",
            )
    # Kept even while retention is 'never', so switching back does not
    # lose the numbers somebody already typed.
    if payload.photo_retention_months is not None:
        org.photo_retention_months = payload.photo_retention_months
    if payload.audio_retention_months is not None:
        org.audio_retention_months = payload.audio_retention_months

    if org.media_retention == MediaRetention.automatic and not (
        org.photo_retention_months or org.audio_retention_months
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Automatic deletion needs a number of months for photos, voice notes, or both.",
        )

    db.commit()
    db.refresh(org)
    return _with_counts(db, [org])[0]


@router.get("/{company_id}/users", response_model=list[CompanyUserOut])
def list_company_users(
    company_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_superadmin),
):
    users = db.query(User).filter(User.organization_id == company_id).order_by(User.name).all()
    return [
        CompanyUserOut(id=u.id, name=u.name, email=u.email, role=u.role.value, is_active=u.is_active)
        for u in users
    ]


@router.post("/{company_id}/admins", response_model=CompanyUserOut, status_code=status.HTTP_201_CREATED)
def create_company_admin(
    company_id: int,
    payload: CompanyAdminCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_superadmin),
):
    """
    An extra admin for a company that already exists — the usual reasons
    being a handover, or a second person who needs their own login rather
    than sharing one. Managers and agents are still created by the
    company's own admin from the Employees screen; this only exists
    because that screen needs an admin to get into it in the first place.
    """
    org = db.query(Organization).filter(Organization.id == company_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    _assert_email_free(db, payload.email)

    user = User(
        organization_id=org.id,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=UserRole.admin,
        joining_date=payload.joining_date,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return CompanyUserOut(id=user.id, name=user.name, email=user.email, role=user.role.value, is_active=user.is_active)
