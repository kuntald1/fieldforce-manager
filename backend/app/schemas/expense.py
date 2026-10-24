from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ExpenseCreate(BaseModel):
    expense_type: str  # "travel" | "food" | "other"
    amount: float
    expense_date: date
    description: str | None = None
    visit_id: int | None = None  # optional — ties this expense to a specific stop


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_id: int
    visit_id: int | None
    expense_type: str
    amount: float
    expense_date: date
    bill_photo_url: str | None
    description: str | None
    status: str
    approved_by: int | None
    created_at: datetime
