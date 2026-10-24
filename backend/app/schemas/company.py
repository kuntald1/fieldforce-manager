from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CompanyOut(BaseModel):
    """One client company, as the superadmin's Companies screen shows it.
    Wider than OrganizationOut (which is what a company sees about ITSELF)
    because this view is about managing the tenant, not working inside it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    subscription_plan: str | None
    is_active: bool
    km_rate: float
    # What agents in this company may attach to a visit, and how long it
    # is kept. Superadmin-only, which is why these live here and not on
    # OrganizationUpdate — storage is the platform's cost, not the
    # client's, so the client's own admin does not get to raise it.
    max_visit_photos: int
    max_audio_seconds: int
    media_retention: str
    photo_retention_months: int | None
    audio_retention_months: int | None
    created_at: datetime
    # Filled in by the endpoint, not the ORM — a count per company, so the
    # screen can show at a glance which companies are actually in use.
    user_count: int = 0
    agent_count: int = 0


class CompanyCreate(BaseModel):
    """Creating a company and its first admin in one step.

    Deliberately one call, not two: a company with no admin can't be
    logged into, so creating one on its own only ever produces a dead
    tenant someone has to remember to finish later.
    """

    name: str = Field(min_length=2, max_length=200)
    subscription_plan: str | None = None
    km_rate: float = 10.0

    admin_name: str = Field(min_length=2, max_length=150)
    admin_email: EmailStr
    admin_password: str = Field(min_length=6, max_length=128)
    admin_phone: str | None = None


class CompanyUpdate(BaseModel):
    name: str | None = None
    subscription_plan: str | None = None
    is_active: bool | None = None

    max_visit_photos: int | None = Field(default=None, ge=0, le=10)
    max_audio_seconds: int | None = Field(default=None, ge=0, le=600)
    # "automatic" | "never". With automatic, the two month counts below
    # decide how long; with never they are ignored but kept, so switching
    # back does not lose what was typed.
    media_retention: str | None = None
    photo_retention_months: int | None = Field(default=None, ge=1, le=120)
    audio_retention_months: int | None = Field(default=None, ge=1, le=120)


class CompanyAdminCreate(BaseModel):
    """An extra admin login for an existing company."""

    name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    phone: str | None = None
    joining_date: date | None = None


class CompanyUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    is_active: bool
