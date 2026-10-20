"""Справочник для выбора организации: регионы и поиск школы внутри региона.

Министерство и администратор системы ищут по всем организациям, остальные —
только среди своих.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.database.db import get_connection
from app.api.permissions import get_user_org_ids, has_global_view_access
from app.api.security import get_current_user

router = APIRouter(prefix="/org", tags=["org-directory"])


async def _visible_org_ids(current_user: dict, conn) -> list[int] | None:
    """None — все организации."""
    if has_global_view_access(current_user):
        return None
    return await get_user_org_ids(current_user["id"], conn)


def _like(value: str) -> str:
    """Подстрока для ILIKE: % и _ из запроса ищутся как обычные символы."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("/municipalities")
async def list_municipalities(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    org_ids = await _visible_org_ids(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT m.id, m.name, COUNT(om.organization_id) AS organizations
        FROM municipalities m
        LEFT JOIN organization_municipalities om
            ON om.municipality_id = m.id
           AND ($1::bigint[] IS NULL OR om.organization_id = ANY($1))
        GROUP BY m.id
        HAVING $1::bigint[] IS NULL OR COUNT(om.organization_id) > 0
        ORDER BY m.name
        """,
        org_ids,
    )
    return [dict(r) for r in rows]


@router.get("/directory")
async def search_organizations(
    municipality_id: Optional[int] = Query(None),
    q: str = Query("", max_length=100),
    limit: int = Query(30, ge=1, le=100),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    org_ids = await _visible_org_ids(current_user, conn)
    query = q.strip()
    rows = await conn.fetch(
        """
        SELECT
            o.id,
            o.name,
            COALESCE(
                ARRAY_AGG(m.name ORDER BY m.name) FILTER (WHERE m.id IS NOT NULL),
                '{}'
            ) AS municipalities
        FROM organizations o
        LEFT JOIN organization_municipalities om ON om.organization_id = o.id
        LEFT JOIN municipalities m ON m.id = om.municipality_id
        WHERE ($1::bigint[] IS NULL OR o.id = ANY($1))
          AND ($2::bigint IS NULL OR EXISTS (
                SELECT 1 FROM organization_municipalities x
                WHERE x.organization_id = o.id AND x.municipality_id = $2
              ))
          AND ($3::text = '' OR o.name ILIKE $4)
        GROUP BY o.id
        ORDER BY o.name
        LIMIT $5
        """,
        org_ids, municipality_id, query, _like(query), limit,
    )
    return [dict(r) for r in rows]
