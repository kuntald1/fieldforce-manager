from datetime import date

from pydantic import BaseModel


class VisitStatusBreakdown(BaseModel):
    pending: int
    checked_in: int
    completed: int
    missed: int


class ApprovalStatusBreakdown(BaseModel):
    """Shared shape for both TA requests and expenses — same 3 statuses."""

    pending: int
    approved: int
    rejected: int


class DeviationSummary(BaseModel):
    resolved: int
    unresolved: int


class AttendanceSummary(BaseModel):
    on_duty: int
    off_duty: int


class DashboardSummary(BaseModel):
    date: date
    visit_status: VisitStatusBreakdown
    deviations: DeviationSummary
    attendance: AttendanceSummary
    ta_status: ApprovalStatusBreakdown
    expense_status: ApprovalStatusBreakdown
