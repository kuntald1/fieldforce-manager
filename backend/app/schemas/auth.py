from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUser(BaseModel):
    """What every protected endpoint gets after decoding the JWT — no DB hit needed."""
    user_id: int
    organization_id: int
    role: str
    name: str
