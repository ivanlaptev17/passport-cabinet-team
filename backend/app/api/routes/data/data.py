from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.api.database.db import get_connection
from app.api.security import _RESTRICTED_ROLES, get_current_user, get_user_org_ids, require_write

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


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _org_ids_filter(current_user: dict, conn) -> list[int] | None:
    """Returns list of allowed org IDs for restricted roles, None means all."""
    if current_user.get("role_code") in _RESTRICTED_ROLES:
        return await get_user_org_ids(current_user["id"], conn)
    return None


def _check_org_access(org_id: int, allowed: list[int] | None) -> None:
    if allowed is not None and org_id not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


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
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT
            e.id,
            e.organization_id,
            e.last_name,
            e.first_name,
            e.middle_name,
            e.phone,
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
          AND ($2::bigint[] IS NULL OR e.organization_id = ANY($2))
        ORDER BY e.last_name, e.first_name
        """,
        category,
        allowed,
    )
    return [dict(r) for r in rows]


@router.get("/organizations")
async def list_organizations(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT o.id, o.name, o.director_name, o.governance_body, o.founder
        FROM organizations o
        WHERE ($1::bigint[] IS NULL OR o.id = ANY($1))
        ORDER BY o.id
        """,
        allowed,
    )
    return [dict(r) for r in rows]


@router.get("/buildings")
async def list_buildings(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
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
        WHERE ($1::bigint[] IS NULL OR b.organization_id = ANY($1))
        ORDER BY b.organization_id, b.id
        """,
        allowed,
    )
    return [dict(r) for r in rows]


@router.get("/staff-info")
async def list_staff_info(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT si.id, si.organization_id, o.name AS organization,
               si.attribute, si.value, si.real_value, si.is_filled
        FROM staff_general_infos si
        JOIN organizations o ON o.id = si.organization_id
        WHERE ($1::bigint[] IS NULL OR si.organization_id = ANY($1))
        ORDER BY si.organization_id, si.id
        """,
        allowed,
    )
    return [dict(r) for r in rows]


@router.get("/finance")
async def list_finance(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT fr.id, fr.organization_id, o.name AS organization,
               fr.section_code, fr.attribute, fr.value, fr.is_filled
        FROM finance_records fr
        JOIN organizations o ON o.id = fr.organization_id
        WHERE ($1::bigint[] IS NULL OR fr.organization_id = ANY($1))
        ORDER BY fr.organization_id, fr.section_code, fr.id
        """,
        allowed,
    )
    return [dict(r) for r in rows]


@router.get("/subsidies")
async def list_subsidies(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT s.id, s.organization_id, o.name AS organization,
               s.name, s.amount
        FROM subsidies s
        JOIN organizations o ON o.id = s.organization_id
        WHERE ($1::bigint[] IS NULL OR s.organization_id = ANY($1))
        ORDER BY s.organization_id, s.id
        """,
        allowed,
    )
    return [dict(r) for r in rows]


@router.get("/contracts")
async def list_contracts(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT c.id, c.organization_id, o.name AS organization,
               c.name, c.link
        FROM contracts c
        JOIN organizations o ON o.id = c.organization_id
        WHERE ($1::bigint[] IS NULL OR c.organization_id = ANY($1))
        ORDER BY c.organization_id, c.id
        """,
        allowed,
    )
    return [dict(r) for r in rows]


@router.get("/finance-summary")
async def finance_summary(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    expenses = await conn.fetchval(
        "SELECT COALESCE(SUM(value), 0) FROM finance_records WHERE ($1::bigint[] IS NULL OR organization_id = ANY($1))",
        allowed,
    )
    budget = await conn.fetchval(
        "SELECT COALESCE(SUM(amount), 0) FROM subsidies WHERE ($1::bigint[] IS NULL OR organization_id = ANY($1))",
        allowed,
    )
    return {
        "budget": float(budget),
        "expenses": float(expenses),
        "remainder": float(budget) - float(expenses),
    }


@router.get("/contingent")
async def list_contingent(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT sc.id, sc.organization_id, o.name AS organization,
               sc.attribute, sc.value, sc.is_filled
        FROM student_contingents sc
        JOIN organizations o ON o.id = sc.organization_id
        WHERE ($1::bigint[] IS NULL OR sc.organization_id = ANY($1))
        ORDER BY sc.organization_id, sc.id
        """,
        allowed,
    )
    return [dict(r) for r in rows]


@router.get("/classes")
async def list_classes(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT sc.id, sc.organization_id, o.name AS organization,
               sc.name, gl.number AS grade_level, sc.student_count
        FROM school_classes sc
        JOIN organizations o ON o.id = sc.organization_id
        LEFT JOIN grade_levels gl ON gl.id = sc.grade_level_id
        WHERE ($1::bigint[] IS NULL OR sc.organization_id = ANY($1))
        ORDER BY sc.organization_id, gl.number, sc.name
        """,
        allowed,
    )
    return [dict(r) for r in rows]


@router.get("/parallels")
async def list_parallels(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT gpc.id, gpc.organization_id, o.name AS organization,
               gpc.title, gpc.values, gpc.is_filled
        FROM grade_parallel_counts gpc
        JOIN organizations o ON o.id = gpc.organization_id
        WHERE ($1::bigint[] IS NULL OR gpc.organization_id = ANY($1))
        ORDER BY gpc.organization_id, gpc.id
        """,
        allowed,
    )
    return [dict(r) for r in rows]


@router.get("/education")
async def list_education(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT ea.id, ea.organization_id, o.name AS organization,
               eat.name AS activity_type, ea.attribute, ea.value,
               ea.is_filled, ea.is_heading, ea.item_order
        FROM education_activities ea
        JOIN organizations o ON o.id = ea.organization_id
        LEFT JOIN education_activity_types eat ON eat.id = ea.type_id
        WHERE ($1::bigint[] IS NULL OR ea.organization_id = ANY($1))
        ORDER BY ea.organization_id, eat.name, ea.item_order, ea.id
        """,
        allowed,
    )
    return [dict(r) for r in rows]


# ── Edit endpoints ────────────────────────────────────────────────────────────

@router.put("/employees/{employee_id}")
async def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    require_write(current_user)

    existing = await conn.fetchrow(
        "SELECT id, organization_id FROM employees WHERE id = $1", employee_id
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    allowed = await _org_ids_filter(current_user, conn)
    _check_org_access(existing["organization_id"], allowed)

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
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    require_write(current_user)

    existing = await conn.fetchrow(
        "SELECT id FROM organizations WHERE id = $1", org_id
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    allowed = await _org_ids_filter(current_user, conn)
    _check_org_access(org_id, allowed)

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
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    require_write(current_user)

    existing = await conn.fetchrow(
        "SELECT id, organization_id FROM buildings WHERE id = $1", building_id
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Building not found")

    allowed = await _org_ids_filter(current_user, conn)
    _check_org_access(existing["organization_id"], allowed)

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
