from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class Example(BaseModel):
    example: str


class RegisterRequest(BaseModel):
    last_name: str = Field(min_length=1, max_length=255)
    first_name: str = Field(min_length=1, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    last_name: str
    first_name: str
    middle_name: str | None
    phone: str | None
    email: EmailStr
    role_id: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
    token_type: str = "bearer"


class LogoutResponse(BaseModel):
    ok: bool = True
