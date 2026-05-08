from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.api.database.db import get_connection
from app.api.security import get_current_user

router = APIRouter(prefix="/data", tags=["data"])


# ── Request models ────────────────────────────────────────────────────────────

class EmployeeUpdate(BaseModel):
    fio: Optional[str] = None
    position_id: Optional[int] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    director_name: Optional[str] = None
    governance_body: Optional[str] = None
    founder: Optional[str] = None


class BuildingUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None


# ── Read endpoints ────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    row = await conn.fetchrow(
        """
        SELECT
            u.id,
            u.last_name,
            u.first_name,
            u.middle_name,
            u.email,
            u.phone,
            r.name AS role_name,
            o.name AS organization_name
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        LEFT JOIN organization_users ou ON ou.user_id = u.id
        LEFT JOIN organizations o ON o.id = ou.organization_id
        WHERE u.id = $1
        LIMIT 1
        """,
        current_user["id"],
    )
    return dict(row) if row else {}


@router.get("/positions")
async def list_positions(
    _current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    rows = await conn.fetch(
        """
        SELECT p.id, p.name, c.name AS category, c.code AS category_code
        FROM positions p
        LEFT JOIN categories c ON c.id = p.category_id
        ORDER BY c.code, p.name
        """
    )
    return [dict(r) for r in rows]


@router.get("/employees")
async def list_employees(
    category: Optional[str] = Query(None, description="Category code: ADM, TEACH, TECH"),
    _current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    rows = await conn.fetch(
        """
        SELECT
            e.id,
            e.fio,
            p.id   AS position_id,
            p.name AS position,
            c.id   AS category_id,
            c.name AS category,
            c.code AS category_code,
            o.name AS organization
        FROM employees e
        JOIN organizations o ON o.id = e.organization_id
        LEFT JOIN employee_positions ep ON ep.employee_id = e.id
        LEFT JOIN positions p ON p.id = ep.position_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ($1::TEXT IS NULL OR c.code = $1)
        ORDER BY e.id
        """,
        category,
    )
    return [dict(r) for r in rows]


@router.get("/organizations")
async def list_organizations(
    _current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    rows = await conn.fetch(
        """
        SELECT
            o.id,
            o.name,
            o.director_name,
            o.governance_body,
            o.founder,
            b.address
        FROM organizations o
        LEFT JOIN LATERAL (
            SELECT address FROM buildings WHERE organization_id = o.id LIMIT 1
        ) b ON TRUE
        ORDER BY o.id
        """
    )
    return [dict(r) for r in rows]


@router.get("/buildings")
async def list_buildings(
    _current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    rows = await conn.fetch(
        """
        SELECT
            b.id,
            b.name,
            b.address,
            b.created_at,
            o.name AS organization
        FROM buildings b
        JOIN organizations o ON o.id = b.organization_id
        ORDER BY b.organization_id, b.id
        """
    )
    return [dict(r) for r in rows]


# ── Edit endpoints ────────────────────────────────────────────────────────────

@router.put("/employees/{employee_id}")
async def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    _current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow(
        "SELECT id FROM employees WHERE id = $1", employee_id
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    if payload.fio is not None:
        await conn.execute(
            "UPDATE employees SET fio = $1 WHERE id = $2",
            payload.fio, employee_id,
        )

    if payload.position_id is not None:
        await conn.execute(
            "DELETE FROM employee_positions WHERE employee_id = $1", employee_id
        )
        await conn.execute(
            "INSERT INTO employee_positions (employee_id, position_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            employee_id, payload.position_id,
        )

    row = await conn.fetchrow(
        """
        SELECT e.id, e.fio,
               p.id AS position_id, p.name AS position,
               c.name AS category, c.code AS category_code,
               o.name AS organization
        FROM employees e
        JOIN organizations o ON o.id = e.organization_id
        LEFT JOIN employee_positions ep ON ep.employee_id = e.id
        LEFT JOIN positions p ON p.id = ep.position_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE e.id = $1
        """,
        employee_id,
    )
    return dict(row)


@router.put("/organizations/{org_id}")
async def update_organization(
    org_id: int,
    payload: OrganizationUpdate,
    _current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow(
        "SELECT id FROM organizations WHERE id = $1", org_id
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    fields = {k: v for k, v in payload.model_dump().items() if v is not None}
    if fields:
        set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(fields))
        await conn.execute(
            f"UPDATE organizations SET {set_clause} WHERE id = $1",
            org_id, *fields.values(),
        )

    row = await conn.fetchrow(
        """
        SELECT o.id, o.name, o.director_name, o.governance_body, o.founder, b.address
        FROM organizations o
        LEFT JOIN LATERAL (SELECT address FROM buildings WHERE organization_id = o.id LIMIT 1) b ON TRUE
        WHERE o.id = $1
        """,
        org_id,
    )
    return dict(row)


@router.put("/buildings/{building_id}")
async def update_building(
    building_id: int,
    payload: BuildingUpdate,
    _current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow(
        "SELECT id FROM buildings WHERE id = $1", building_id
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Building not found")

    fields = {k: v for k, v in payload.model_dump().items() if v is not None}
    if fields:
        set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(fields))
        await conn.execute(
            f"UPDATE buildings SET {set_clause} WHERE id = $1",
            building_id, *fields.values(),
        )

    row = await conn.fetchrow(
        """
        SELECT b.id, b.name, b.address, b.created_at, o.name AS organization
        FROM buildings b
        JOIN organizations o ON o.id = b.organization_id
        WHERE b.id = $1
        """,
        building_id,
    )
    return dict(row)
