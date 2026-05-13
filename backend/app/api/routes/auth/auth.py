from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.api.database.db import get_connection
from app.api.models import (
    LoginRequest,
    LogoutResponse,
    RegisterRequest,
    UserResponse,
)
from app.api.security import (
    generate_session_token,
    get_current_user,
    hash_password,
    hash_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_LIFETIME_DAYS = 7

_COOKIE_PARAMS = dict(
    key="access_token",
    httponly=True,
    samesite="lax",
    max_age=SESSION_LIFETIME_DAYS * 86400,
)


async def _create_session(user_id: int, conn) -> str:
    raw_token = generate_session_token()
    await conn.execute(
        """
        INSERT INTO user_sessions (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        """,
        user_id,
        hash_token(raw_token),
        datetime.utcnow() + timedelta(days=SESSION_LIFETIME_DAYS),
    )
    return raw_token


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, response: Response, conn=Depends(get_connection)):
    existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", payload.email)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = await conn.fetchrow(
        """
        INSERT INTO users (email, password_hash, is_active)
        VALUES ($1, $2, TRUE)
        RETURNING id, last_name, first_name, middle_name, phone, email,
                  role_id, is_active, created_at, updated_at
        """,
        payload.email,
        hash_password(payload.password),
    )

    raw_token = await _create_session(user["id"], conn)
    response.set_cookie(value=raw_token, **_COOKIE_PARAMS)
    return {**dict(user), "role_code": None, "role_name": None}


@router.post("/login", response_model=UserResponse)
async def login(payload: LoginRequest, response: Response, conn=Depends(get_connection)):
    user = await conn.fetchrow(
        """
        SELECT u.id, u.last_name, u.first_name, u.middle_name, u.phone, u.email,
               u.password_hash, u.role_id, u.is_active, u.created_at, u.updated_at,
               r.code AS role_code, r.name AS role_name
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.email = $1
        """,
        payload.email,
    )

    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

    raw_token = await _create_session(user["id"], conn)
    response.set_cookie(value=raw_token, **_COOKIE_PARAMS)

    return {
        "id": user["id"],
        "last_name": user["last_name"],
        "first_name": user["first_name"],
        "middle_name": user["middle_name"],
        "phone": user["phone"],
        "email": user["email"],
        "role_id": user["role_id"],
        "role_code": user["role_code"],
        "role_name": user["role_name"],
        "is_active": user["is_active"],
        "created_at": user["created_at"],
        "updated_at": user["updated_at"],
    }


@router.get("/me", response_model=UserResponse)
async def me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/logout", response_model=LogoutResponse)
async def logout(request: Request, response: Response, conn=Depends(get_connection)):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    await conn.execute(
        """
        UPDATE user_sessions
        SET revoked_at = NOW()
        WHERE token_hash = $1 AND revoked_at IS NULL
        """,
        hash_token(token),
    )

    response.delete_cookie("access_token")
    return {"ok": True}
