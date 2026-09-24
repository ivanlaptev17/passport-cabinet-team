"""Управление организацией: сотрудники, их роли и здания.

Доступно Администратору и Директору ОО своей организации и глобальному администратору.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.database.db import get_connection
from app.api.permissions import (
    ORG_ADMIN,
    ORG_DIRECTOR,
    ORG_RESPONSIBLE,
    ORG_ROLE_LABELS,
    ORG_STAFF,
)
from app.api.routes.tasks.access import org_permissions
from app.api.security import get_current_user, has_global_full_access

router = APIRouter(prefix="/org", tags=["org-admin"])

# Что может раздавать Администратор ОО. Директора и Администратора назначает
# только глобальный администратор — иначе Администратор ОО мог бы снять директора
ASSIGNABLE_BY_ORG = {ORG_STAFF, ORG_RESPONSIBLE}
ASSIGNABLE_BY_GLOBAL = {ORG_STAFF, ORG_RESPONSIBLE, ORG_DIRECTOR, ORG_ADMIN}



class MemberUpdate(BaseModel):
    org_role_code: Optional[str] = None
    position_title: Optional[str] = None
    building_id: Optional[int] = None
    # building_id = null — законное значение («без здания»), поэтому отдельный флаг
    clear_building: bool = False


async def _require_manager(conn, current_user: dict, organization_id: int) -> None:
    perms = await org_permissions(conn, current_user, organization_id)
    if not perms["can_manage"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Управлять организацией может Администратор или Директор ОО",
        )


_MEMBER_SELECT = """
    SELECT
        u.id AS user_id,
        u.last_name,
        u.first_name,
        u.middle_name,
        u.email,
        u.phone,
        om.org_role_code,
        om.position_title,
        om.building_id,
        b.name AS building_name,
        om.is_active
    FROM organization_memberships om
    JOIN users u ON u.id = om.user_id
    LEFT JOIN buildings b ON b.id = om.building_id
"""


def _with_label(row) -> dict:
    member = dict(row)
    member["org_role_label"] = ORG_ROLE_LABELS.get(member["org_role_code"] or "")
    return member


@router.get("/{organization_id:int}/members")
async def list_members(
    organization_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    await _require_manager(conn, current_user, organization_id)
    rows = await conn.fetch(
        f"""
        {_MEMBER_SELECT}
        WHERE om.organization_id = $1
        ORDER BY om.is_active DESC, u.last_name, u.first_name
        """,
        organization_id,
    )
    return {
        "members": [_with_label(r) for r in rows],
        # какие роли текущий пользователь вправе выдавать — чтобы фронт не показывал лишнего
        "assignable_roles": [
            {"code": code, "label": ORG_ROLE_LABELS[code]}
            for code in (ORG_STAFF, ORG_RESPONSIBLE, ORG_DIRECTOR, ORG_ADMIN)
            if code in (ASSIGNABLE_BY_GLOBAL if has_global_full_access(current_user) else ASSIGNABLE_BY_ORG)
        ],
    }


@router.put("/{organization_id:int}/members/{user_id:int}")
async def update_member(
    organization_id: int,
    user_id: int,
    payload: MemberUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    await _require_manager(conn, current_user, organization_id)
    is_global_admin = has_global_full_access(current_user)

    member = await conn.fetchrow(
        "SELECT org_role_code FROM organization_memberships WHERE organization_id = $1 AND user_id = $2",
        organization_id, user_id,
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден в организации")

    updates: dict[str, object] = {}

    if payload.org_role_code is not None and payload.org_role_code != member["org_role_code"]:
        allowed = ASSIGNABLE_BY_GLOBAL if is_global_admin else ASSIGNABLE_BY_ORG
        if payload.org_role_code not in ASSIGNABLE_BY_GLOBAL:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неизвестная роль")
        if not is_global_admin:
            # Себя не трогаем: случайно снять с себя права — и назад уже не вернуть
            if user_id == current_user["id"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Свою роль изменить нельзя",
                )
            # Директора и Администратора ОО меняет только глобальный администратор
            if member["org_role_code"] not in ASSIGNABLE_BY_ORG or payload.org_role_code not in allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Назначать и снимать Директора и Администратора ОО может только администратор системы",
                )
        updates["org_role_code"] = payload.org_role_code

    if payload.position_title is not None:
        title = payload.position_title.strip()
        updates["position_title"] = title[:200] or None

    if payload.clear_building:
        updates["building_id"] = None
    elif payload.building_id is not None:
        building_ok = await conn.fetchval(
            "SELECT 1 FROM buildings WHERE id = $1 AND organization_id = $2",
            payload.building_id, organization_id,
        )
        if not building_ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Здание не принадлежит организации",
            )
        updates["building_id"] = payload.building_id

    if updates:
        # имена колонок — только из фиксированного набора выше, значения — параметрами
        columns = list(updates)
        assignments = ", ".join(f"{col} = ${i + 3}" for i, col in enumerate(columns))
        await conn.execute(
            f"""
            UPDATE organization_memberships
            SET {assignments}, updated_at = NOW()
            WHERE organization_id = $1 AND user_id = $2
            """,
            organization_id, user_id, *[updates[c] for c in columns],
        )

    row = await conn.fetchrow(
        f"{_MEMBER_SELECT} WHERE om.organization_id = $1 AND om.user_id = $2",
        organization_id, user_id,
    )
    return _with_label(row)
