import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.enums import UserRole
from app.core.deps import require_role
from app.core.security import hash_password
from app.schemas.auth import CurrentUser
from app.schemas.user import UserOut, UserCreate, UserUpdate

router = APIRouter()

ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png"}
EMPLOYEE_PHOTO_DIR = "uploads/employee_photos"

VALID_ROLES = {r.value for r in UserRole}


@router.get("", response_model=list[UserOut])
def list_users(
    role: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    """Lists everyone in the org — agents and managers alike."""
    query = db.query(User).filter(User.organization_id == current_user.organization_id)
    if role is not None:
        query = query.filter(User.role == role)
    return query.order_by(User.name).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """
    Admin-only — creating an account and assigning a role is sensitive
    enough that managers shouldn't be able to do it themselves.
    This is the "Employee Details — Add" step; joining_date is required
    here (unlike on the model, where it's nullable for pre-existing rows).
    """
    if payload.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"role must be one of {sorted(VALID_ROLES)}",
        )

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists")

    user = User(
        organization_id=current_user.organization_id,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=UserRole(payload.role),
        joining_date=payload.joining_date,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
):
    user = (
        db.query(User)
        .filter(User.id == user_id, User.organization_id == current_user.organization_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.role is not None:
        if payload.role not in VALID_ROLES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"role must be one of {sorted(VALID_ROLES)}",
            )
        user.role = UserRole(payload.role)
    if payload.name is not None:
        user.name = payload.name
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.joining_date is not None:
        user.joining_date = payload.joining_date
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/photo", response_model=UserOut)
async def upload_employee_photo(
    user_id: int,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
):
    """
    Separate from create/update since this is multipart, not JSON — same
    reasoning as visit check-in photos being their own thing. Admin-only,
    matching who can create/edit employees at all.
    """
    user = (
        db.query(User)
        .filter(User.id == user_id, User.organization_id == current_user.organization_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    ext = os.path.splitext(photo.filename or "")[1].lower()
    if ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported photo format '{ext}' — use jpg or png",
        )

    os.makedirs(EMPLOYEE_PHOTO_DIR, exist_ok=True)
    filename = f"user{user_id}_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(EMPLOYEE_PHOTO_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(await photo.read())

    user.photo_url = f"/uploads/employee_photos/{filename}"
    db.commit()
    db.refresh(user)
    return user
