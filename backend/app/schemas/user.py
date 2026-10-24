from datetime import date

from pydantic import BaseModel, EmailStr, ConfigDict


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    password: str
    role: str  # "admin" | "manager" | "agent"
    joining_date: date


class UserUpdate(BaseModel):
    """All optional — update only what's provided. No email/password change
    here; those are separate, more sensitive flows not built yet."""
    name: str | None = None
    phone: str | None = None
    role: str | None = None
    joining_date: date | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str | None
    role: str
    joining_date: date | None
    photo_url: str | None
    is_active: bool
