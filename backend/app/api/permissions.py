from typing import Iterable

from fastapi import HTTPException, status


GLOBAL_FULL_ACCESS_ROLES = {"ADMIN"}
GLOBAL_READONLY_ROLES = {"MINOBR"}
ORG_SCOPED_ROLES = {"DIRECTOR", "SCHOOL_STAFF"}


def has_global_full_access(current_user: dict) -> bool:
    return current_user.get("role_code") in GLOBAL_FULL_ACCESS_ROLES


def has_global_readonly_access(current_user: dict) -> bool:
    return current_user.get("role_code") in GLOBAL_READONLY_ROLES


def is_org_scoped_user(current_user: dict) -> bool:
    return current_user.get("role_code") in ORG_SCOPED_ROLES


async def get_user_memberships(user_id: int, conn) -> list[dict]:
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
    return [dict(r) for r in rows]


async def get_user_org_ids(user_id: int, conn) -> list[int]:
    memberships = await get_user_memberships(user_id, conn)
    return [m["organization_id"] for m in memberships]


async def get_membership_for_org(user_id: int, organization_id: int, conn) -> dict | None:
    memberships = await get_user_memberships(user_id, conn)
    for membership in memberships:
        if membership["organization_id"] == organization_id:
            return membership
    return None


async def require_org_view_access(current_user: dict, organization_id: int, conn) -> dict | None:
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