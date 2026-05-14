import base64
import hashlib
import hmac
import secrets
from typing import Iterable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.database.db import get_connection

bearer_scheme = HTTPBearer(auto_error=False)

GLOBAL_FULL_ACCESS_ROLES = {"ADMIN"}
GLOBAL_READONLY_ROLES = {"MINOBR"}
ORG_SCOPED_ROLES = {"DIRECTOR", "SCHOOL_STAFF"}


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


def has_global_full_access(current_user: dict) -> bool:
    return current_user.get("role_code") in GLOBAL_FULL_ACCESS_ROLES


def has_global_readonly_access(current_user: dict) -> bool:
    return current_user.get("role_code") in GLOBAL_READONLY_ROLES


def is_org_scoped_user(current_user: dict) -> bool:
    return current_user.get("role_code") in ORG_SCOPED_ROLES


async def get_user_memberships(user_id: int, conn) -> list[dict]:
    """
    Новая модель:
    сначала читаем organization_memberships.
    Если там пусто, временно падаем обратно на organization_users,
    чтобы не сломать старую логику.
    """
    rows = await conn.fetch(
        """
        SELECT
            om.id,
            om.user_id,
            om.organization_id,
            om.org_role_code,
            om.position_title,
            om.is_active,
            om.created_at,
            om.updated_at
        FROM organization_memberships om
        WHERE om.user_id = $1
          AND om.is_active = TRUE
        ORDER BY om.organization_id, om.id
        """,
        user_id,
    )

    memberships = [dict(r) for r in rows]
    if memberships:
        return memberships

    # Fallback на старую схему
    fallback_rows = await conn.fetch(
        """
        SELECT
            NULL::BIGINT AS id,
            ou.user_id,
            ou.organization_id,
            CASE
                WHEN r.code = 'DIRECTOR' THEN 'DIRECTOR'
                ELSE 'STAFF'
            END AS org_role_code,
            NULL::TEXT AS position_title,
            TRUE AS is_active,
            NOW() AS created_at,
            NOW() AS updated_at
        FROM organization_users ou
        JOIN users u ON u.id = ou.user_id
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE ou.user_id = $1
        ORDER BY ou.organization_id
        """,
        user_id,
    )
    return [dict(r) for r in fallback_rows]


async def get_user_org_ids(user_id: int, conn) -> list[int]:
    memberships = await get_user_memberships(user_id, conn)
    return [m["organization_id"] for m in memberships]


async def get_membership_for_org(user_id: int, organization_id: int, conn) -> dict | None:
    memberships = await get_user_memberships(user_id, conn)
    for membership in memberships:
        if membership["organization_id"] == organization_id:
            return membership
    return None


def require_write(current_user: dict) -> None:
    """
    Старую функцию оставляем, чтобы не ломать уже написанный код.
    Пока она просто запрещает запись для MINOBR.
    """
    if has_global_readonly_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only role",
        )


async def require_org_view_access(current_user: dict, organization_id: int, conn) -> dict | None:
    """
    Проверка доступа на просмотр данных организации.
    ADMIN / MINOBR видят всё.
    Для DIRECTOR / SCHOOL_STAFF нужна membership-связь.
    """
    if has_global_full_access(current_user) or has_global_readonly_access(current_user):
        return None

    membership = await get_membership_for_org(current_user["id"], organization_id, conn)
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this organization",
        )

    return membership


async def require_org_write_access(
    current_user: dict,
    organization_id: int,
    conn,
    allowed_org_roles: Iterable[str] = ("DIRECTOR",),
) -> dict | None:
    """
    Проверка доступа на запись в рамках организации.

    Логика:
    - ADMIN может всё
    - MINOBR не может редактировать
    - для остальных нужна membership в этой организации
    - и org_role_code должен входить в allowed_org_roles
    """
    if has_global_full_access(current_user):
        return None

    if has_global_readonly_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only role",
        )

    membership = await get_membership_for_org(current_user["id"], organization_id, conn)
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this organization",
        )

    if membership["org_role_code"] not in set(allowed_org_roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient organization role",
        )

    return membership


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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    row = await conn.fetchrow(
        """
        SELECT
            u.id,
            u.last_name,
            u.first_name,
            u.middle_name,
            u.phone,
            u.email,
            u.role_id,
            u.is_active,
            u.created_at,
            u.updated_at,
            r.code AS role_code,
            r.name AS role_name
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )

    return dict(row)
    