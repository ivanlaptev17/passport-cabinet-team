import base64
import hashlib
import hmac
import secrets

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.database.db import get_connection

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return base64.b64encode(salt + dk).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        raw = base64.b64decode(password_hash.encode("utf-8"))
        salt = raw[:16]
        saved_dk = raw[16:]

        check_dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            100_000,
        )
        return hmac.compare_digest(saved_dk, check_dk)
    except Exception:
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


_RESTRICTED_ROLES = {"DIRECTOR", "SCHOOL_STAFF"}


async def get_user_org_ids(user_id: int, conn) -> list[int]:
    rows = await conn.fetch(
        "SELECT organization_id FROM organization_users WHERE user_id = $1",
        user_id,
    )
    return [r["organization_id"] for r in rows]


def require_write(current_user: dict) -> None:
    if current_user.get("role_code") == "MINOBR":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Read-only role")


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    conn=Depends(get_connection),
):
    # Сначала пробуем Bearer-заголовок, затем httpOnly cookie
    if credentials is not None and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    else:
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    row = await conn.fetchrow(
        """
        SELECT u.id, u.last_name, u.first_name, u.middle_name,
               u.phone, u.email, u.role_id, u.is_active,
               u.created_at, u.updated_at,
               r.code AS role_code, r.name AS role_name
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND u.is_active = TRUE
        """,
        hash_token(token),
    )

    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

    return dict(row)
