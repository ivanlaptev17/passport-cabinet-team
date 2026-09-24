"""Теги задач. Свои у каждой организации: ничего не хардкодим, заводят сами."""

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel

from app.api.database.db import get_connection
from app.api.permissions import require_org_view_access
from app.api.routes.tasks.access import org_permissions
from app.api.security import get_current_user

router = APIRouter(prefix="/tasks", tags=["task-categories"])

# Цвета по кругу — чтобы новые теги не сливались, если цвет не выбрали
PALETTE = ["#1e88e5", "#43a047", "#8d6e63", "#8e24aa", "#fb8c00", "#00897b", "#e53935", "#546e7a"]
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_NAME = 40


class CategoryCreate(BaseModel):
    organization_id: int
    name: str
    color: Optional[str] = None


_CATEGORY_FIELDS = "id, organization_id, name, color"


@router.get("/categories")
async def list_categories(
    organization_id: int = Query(...),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    await require_org_view_access(current_user, organization_id, conn)
    rows = await conn.fetch(
        f"SELECT {_CATEGORY_FIELDS} FROM org_categories WHERE organization_id = $1 ORDER BY lower(name)",
        organization_id,
    )
    return [dict(r) for r in rows]


@router.post("/categories")
async def create_category(
    payload: CategoryCreate,
    response: Response,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    """Создать тег. Такой уже есть (без учёта регистра) — возвращаем его, а не ошибку:
    тег создаётся прямо из формы задачи, и повтор не должен её ломать."""
    perms = await org_permissions(conn, current_user, payload.organization_id)
    if not perms["can_write"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Создавать теги могут сотрудники организации",
        )

    name = " ".join(payload.name.split())
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Название тега пустое")
    if len(name) > MAX_NAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Название тега длиннее {MAX_NAME} символов",
        )
    if payload.color is not None and not COLOR_RE.match(payload.color):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Цвет в формате #rrggbb")

    existing = await conn.fetchrow(
        f"SELECT {_CATEGORY_FIELDS} FROM org_categories WHERE organization_id = $1 AND lower(name) = lower($2)",
        payload.organization_id, name,
    )
    if existing:
        response.status_code = status.HTTP_200_OK
        return dict(existing)

    color = payload.color
    if color is None:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM org_categories WHERE organization_id = $1",
            payload.organization_id,
        )
        color = PALETTE[count % len(PALETTE)]

    # ON CONFLICT — на случай, если два человека одновременно создают один тег
    row = await conn.fetchrow(
        f"""
        INSERT INTO org_categories (organization_id, name, color, created_by_user_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (organization_id, lower(name)) DO UPDATE SET name = org_categories.name
        RETURNING {_CATEGORY_FIELDS}
        """,
        payload.organization_id, name, color, current_user["id"],
    )
    response.status_code = status.HTTP_201_CREATED
    return dict(row)


@router.delete("/categories/{category_id:int}")
async def delete_category(
    category_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    """Удалить тег. Снимается со всех задач организации — поэтому только проверяющим."""
    row = await conn.fetchrow(
        "SELECT organization_id FROM org_categories WHERE id = $1",
        category_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тег не найден")

    perms = await org_permissions(conn, current_user, row["organization_id"])
    if not perms["can_complete"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Удалять теги могут Ответственный, Директор или Администратор ОО",
        )

    await conn.execute("DELETE FROM org_categories WHERE id = $1", category_id)
    return {"ok": True}
