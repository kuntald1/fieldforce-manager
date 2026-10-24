from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.menu import MenuItem, MenuRolePermission
from app.core.deps import get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.menu import MenuItemOut

router = APIRouter()


@router.get("/my-menu", response_model=list[MenuItemOut])
def my_menu(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    The sidebar is built from this, not a hardcoded role check in React —
    granting/revoking a role's access to a screen is a database change
    (MenuRolePermission row), not a code change.
    """
    return (
        db.query(MenuItem)
        .join(MenuRolePermission, MenuRolePermission.menu_item_id == MenuItem.id)
        .filter(MenuRolePermission.role == current_user.role)
        .order_by(MenuItem.sort_order)
        .all()
    )
