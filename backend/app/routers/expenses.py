import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.expense import Expense
from app.models.visit import Visit
from app.models.enums import ExpenseStatus
from app.core.deps import get_current_user, require_role
from app.schemas.auth import CurrentUser
from app.schemas.expense import ExpenseCreate, ExpenseOut

router = APIRouter()

VALID_EXPENSE_TYPES = {"travel", "food", "other"}
ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png"}
EXPENSE_PHOTO_DIR = "uploads/expense_photos"


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    """Agent-only, self-service — same reasoning as attendance and TA/
    approval requests: the agent has their own web session, no admin
    stand-in needed. The bill photo (if any) is a separate upload, same
    pattern as visit check-in and employee photos."""
    if payload.expense_type not in VALID_EXPENSE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"expense_type must be one of {sorted(VALID_EXPENSE_TYPES)}",
        )
    if payload.amount <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="amount must be positive")

    if payload.visit_id is not None:
        visit = (
            db.query(Visit)
            .filter(
                Visit.id == payload.visit_id,
                Visit.organization_id == current_user.organization_id,
                Visit.agent_id == current_user.user_id,
            )
            .first()
        )
        if not visit:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")

    expense = Expense(
        organization_id=current_user.organization_id,
        agent_id=current_user.user_id,
        visit_id=payload.visit_id,
        expense_type=payload.expense_type,
        amount=payload.amount,
        expense_date=payload.expense_date,
        description=payload.description,
        status=ExpenseStatus.pending,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.post("/{expense_id}/photo", response_model=ExpenseOut)
async def upload_expense_photo(
    expense_id: int,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("agent")),
):
    expense = (
        db.query(Expense)
        .filter(
            Expense.id == expense_id,
            Expense.organization_id == current_user.organization_id,
            Expense.agent_id == current_user.user_id,
        )
        .first()
    )
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    ext = os.path.splitext(photo.filename or "")[1].lower()
    if ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported photo format '{ext}' — use jpg or png",
        )

    os.makedirs(EXPENSE_PHOTO_DIR, exist_ok=True)
    filename = f"expense{expense_id}_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(EXPENSE_PHOTO_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(await photo.read())

    expense.bill_photo_url = f"/uploads/expense_photos/{filename}"
    db.commit()
    db.refresh(expense)
    return expense


@router.get("", response_model=list[ExpenseOut])
def list_expenses(
    agent_id: int | None = None,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Same self-scoping pattern as every other list endpoint."""
    query = db.query(Expense).filter(Expense.organization_id == current_user.organization_id)
    if current_user.role == "agent":
        query = query.filter(Expense.agent_id == current_user.user_id)
    elif agent_id is not None:
        query = query.filter(Expense.agent_id == agent_id)
    if status_filter is not None:
        query = query.filter(Expense.status == status_filter)
    return query.order_by(Expense.created_at.desc()).all()


def _get_pending_expense(db: Session, current_user: CurrentUser, expense_id: int) -> Expense:
    expense = (
        db.query(Expense)
        .filter(Expense.id == expense_id, Expense.organization_id == current_user.organization_id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    if expense.status != ExpenseStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"This expense was already {expense.status.value}.")
    return expense


@router.post("/{expense_id}/approve", response_model=ExpenseOut)
def approve_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    expense = _get_pending_expense(db, current_user, expense_id)
    expense.status = ExpenseStatus.approved
    expense.approved_by = current_user.user_id
    db.commit()
    db.refresh(expense)
    return expense


@router.post("/{expense_id}/reject", response_model=ExpenseOut)
def reject_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "manager")),
):
    expense = _get_pending_expense(db, current_user, expense_id)
    expense.status = ExpenseStatus.rejected
    expense.approved_by = current_user.user_id  # only "reviewer" field the model has — tracks the decision either way
    db.commit()
    db.refresh(expense)
    return expense
