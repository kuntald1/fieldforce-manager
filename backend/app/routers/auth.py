from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.core.security import verify_password, create_access_token
from app.core.deps import get_current_user
from app.schemas.auth import LoginRequest, TokenResponse, CurrentUser

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    # Same error for "no such user" and "wrong password" — don't let a
    # login form reveal which emails exist in the system.
    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password",
    )

    if not user or not verify_password(payload.password, user.password_hash):
        raise invalid_credentials

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated",
        )

    token = create_access_token(
        subject=str(user.id),
        extra_claims={
            "org_id": user.organization_id,
            "role": user.role.value,
            "name": user.name,
        },
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=CurrentUser)
def read_current_user(current_user: CurrentUser = Depends(get_current_user)):
    """Quick way to sanity-check a token — also what the frontend calls on app load."""
    return current_user
