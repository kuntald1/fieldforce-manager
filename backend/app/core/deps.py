"""
Every protected router depends on get_current_user (or require_role()).
This is the ONE place that decodes the JWT — get it right here once,
instead of re-checking organization_id by hand in every endpoint.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from app.core.security import decode_access_token
from app.schemas.auth import CurrentUser

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        org_id = payload.get("org_id")
        role = payload.get("role")
        name = payload.get("name")
        if user_id is None or org_id is None or role is None:
            raise credentials_error
    except JWTError:
        raise credentials_error

    return CurrentUser(user_id=int(user_id), organization_id=org_id, role=role, name=name)


def require_role(*allowed_roles: str):
    """
    Usage: Depends(require_role("admin", "manager"))
    Raises 403 if the logged-in user's role isn't in allowed_roles —
    e.g. keeps agents out of manager-only reporting endpoints.
    """
    def _checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not permitted to perform this action",
            )
        return current_user
    return _checker
