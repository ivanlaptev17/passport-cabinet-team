from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from app.api.database.db import get_connection
from app.api.models import (
    AuthResponse,
    LoginRequest,
    LogoutResponse,
    RegisterRequest,
    UserResponse,
)
from app.api.security import (
    bearer_scheme,
    generate_session_token,
    get_current_user,
    hash_password,
    hash_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_LIFETIME_DAYS = 7


@router.post("/register", response_model=AuthResponse)
async def register(payload: RegisterRequest, conn=Depends(get_connection)):
    existing_user = await conn.fetchrow(
        """
        SELECT id
        FROM users
        WHERE email = $1
        """,
        payload.email,
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists",
        )

    user = await conn.fetchrow(
        """
        INSERT INTO users (
            last_name,
            first_name,
            middle_name,
            phone,
            email,
            password_hash,
            is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        RETURNING
            id,
            last_name,
            first_name,
            middle_name,
            phone,
            email,
            role_id,
            is_active,
            created_at,
            updated_at
        """,
        None,
        None,
        None,
        None,
        payload.email,
        hash_password(payload.password),
    )

    raw_token = generate_session_token()

    await conn.execute(
        """
        INSERT INTO user_sessions (
            user_id,
            token_hash,
            expires_at
        )
        VALUES ($1, $2, $3)
        """,
        user["id"],
        hash_token(raw_token),
        datetime.utcnow() + timedelta(days=SESSION_LIFETIME_DAYS),
    )

    return {
        "user": dict(user),
        "access_token": raw_token,
        "token_type": "bearer",
    }


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, conn=Depends(get_connection)):
    user = await conn.fetchrow(
        """
        SELECT
            id,
            last_name,
            first_name,
            middle_name,
            phone,
            email,
            password_hash,
            role_id,
            is_active,
            created_at,
            updated_at
        FROM users
        WHERE email = $1
        """,
        payload.email,
    )

    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )

    raw_token = generate_session_token()

    await conn.execute(
        """
        INSERT INTO user_sessions (
            user_id,
            token_hash,
            expires_at
        )
        VALUES ($1, $2, $3)
        """,
        user["id"],
        hash_token(raw_token),
        datetime.utcnow() + timedelta(days=SESSION_LIFETIME_DAYS),
    )

    return {
        "user": {
            "id": user["id"],
            "last_name": user["last_name"],
            "first_name": user["first_name"],
            "middle_name": user["middle_name"],
            "phone": user["phone"],
            "email": user["email"],
            "role_id": user["role_id"],
            "is_active": user["is_active"],
            "created_at": user["created_at"],
            "updated_at": user["updated_at"],
        },
        "access_token": raw_token,
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserResponse)
async def me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    conn=Depends(get_connection),
):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    await conn.execute(
        """
        UPDATE user_sessions
        SET revoked_at = NOW()
        WHERE token_hash = $1
          AND revoked_at IS NULL
        """,
        hash_token(credentials.credentials),
    )

    return {"ok": True}
    