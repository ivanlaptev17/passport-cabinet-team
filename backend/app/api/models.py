from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    last_name: str | None
    first_name: str | None
    middle_name: str | None
    phone: str | None
    email: EmailStr
    role_id: int | None
    role_code: str | None
    role_name: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class LogoutResponse(BaseModel):
    ok: bool = True
