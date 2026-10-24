from datetime import date, datetime

from pydantic import BaseModel


class AgentDailySummary(BaseModel):
    agent_id: int
    date: date
    planned_km: float | None
    actual_km: float
    visits_total: int
    visits_completed: int
    deviation_count: int
    # Latest Task Approval / Travel Allowance request for this route, if
    # any — None means the agent never requested one for this task, not
    # that it was rejected (the UI must tell those apart).
    approval_status: str | None = None
    ta_status: str | None = None
    ta_claimed_km: float | None = None
    ta_approved_km: float | None = None
    ta_amount: float | None = None


class AgentFinanceSummary(BaseModel):
    agent_id: int
    total_ta_amount: float
    total_expense_amount: float
    total_combined: float


class DeviationHistoryItem(BaseModel):
    id: int
    agent_id: int
    daily_route_id: int | None
    distance_from_route_m: float
    detected_at: datetime
    resolved: bool

    class Config:
        from_attributes = True


class CustomerVisitFrequency(BaseModel):
    customer_id: int
    customer_name: str
    visit_count: int
