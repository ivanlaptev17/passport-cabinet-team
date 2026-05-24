from typing import Optional, List
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from app.api.database.db import get_connection
from app.api.security import get_current_user
from app.api.permissions import (
    get_user_org_ids,
    is_org_scoped_user,
    require_org_write_access,
)


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

class IncidentCreate(BaseModel):
    organization_id: int
    title: str
    description: Optional[str] = None
    status: str = "OPEN"
    severity: str = "MEDIUM"
    incident_date: Optional[date] = None


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    incident_date: Optional[date] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _org_ids_filter(current_user: dict, conn) -> list[int] | None:
    if is_org_scoped_user(current_user):
        return await get_user_org_ids(current_user["id"], conn)
    return None



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
            COALESCE(org_from_membership.name, org_from_legacy.name) AS organization_name
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id

        LEFT JOIN LATERAL (
            SELECT om.organization_id
            FROM organization_memberships om
            WHERE om.user_id = u.id
              AND om.is_active = TRUE
            ORDER BY om.organization_id
            LIMIT 1
        ) membership_org ON TRUE
        LEFT JOIN organizations org_from_membership
            ON org_from_membership.id = membership_org.organization_id

        LEFT JOIN LATERAL (
            SELECT ou.organization_id
            FROM organization_users ou
            WHERE ou.user_id = u.id
            ORDER BY ou.organization_id
            LIMIT 1
        ) legacy_org ON TRUE
        LEFT JOIN organizations org_from_legacy
            ON org_from_legacy.id = legacy_org.organization_id

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

@router.get("/incidents")
async def list_incidents(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT
            i.id,
            i.organization_id,
            o.name AS organization,
            i.title,
            i.description,
            i.status,
            i.severity,
            i.incident_date,
            i.created_by_user_id,
            i.created_at,
            i.updated_at
        FROM incidents i
        JOIN organizations o ON o.id = i.organization_id
        WHERE ($1::bigint[] IS NULL OR i.organization_id = ANY($1))
        ORDER BY i.incident_date DESC, i.id DESC
        """,
        allowed,
    )
    return [dict(r) for r in rows]

@router.get("/incidents/widget")
async def incidents_widget(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT
            i.id,
            i.organization_id,
            o.name AS organization,
            i.title,
            i.status,
            i.severity,
            i.incident_date
        FROM incidents i
        JOIN organizations o ON o.id = i.organization_id
        WHERE ($1::bigint[] IS NULL OR i.organization_id = ANY($1))
        ORDER BY i.incident_date DESC, i.id DESC
        LIMIT 5
        """,
        allowed,
    )
    return [dict(r) for r in rows]

@router.post("/incidents")
async def create_incident(
    payload: IncidentCreate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    await require_org_write_access(
        current_user,
        payload.organization_id,
        conn,
        allowed_org_roles=("DIRECTOR", "STAFF"),
    )

    row = await conn.fetchrow(
        """
        INSERT INTO incidents (
            organization_id,
            title,
            description,
            status,
            severity,
            incident_date,
            created_by_user_id
        )
        VALUES (
            $1, $2, $3, $4, $5,
            COALESCE($6::date, CURRENT_DATE),
            $7
        )
        RETURNING
            id,
            organization_id,
            title,
            description,
            status,
            severity,
            incident_date,
            created_by_user_id,
            created_at,
            updated_at
        """,
        payload.organization_id,
        payload.title,
        payload.description,
        payload.status,
        payload.severity,
        payload.incident_date,
        current_user["id"],
    )
    return dict(row)


# ── Edit endpoints ────────────────────────────────────────────────────────────

@router.put("/employees/{employee_id}")
async def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow(
        "SELECT id, organization_id FROM employees WHERE id = $1",
        employee_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )

    await require_org_write_access(
        current_user,
        existing["organization_id"],
        conn,
        allowed_org_roles=("DIRECTOR", "STAFF"),
    )

    if payload.fio is not None:
        await conn.execute(
            "UPDATE employees SET fio = $1 WHERE id = $2",
            payload.fio,
            employee_id,
        )

    if payload.position_id is not None:
        await conn.execute(
            "DELETE FROM employee_positions WHERE employee_id = $1",
            employee_id,
        )
        await conn.execute(
            """
            INSERT INTO employee_positions (employee_id, position_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            employee_id,
            payload.position_id,
        )

    row = await conn.fetchrow(
        """
        SELECT
            e.id,
            e.organization_id,
            e.last_name,
            e.first_name,
            e.middle_name,
            e.phone,
            e.fio,
            p.id AS position_id,
            p.name AS position,
            c.id AS category_id,
            c.name AS category,
            c.code AS category_code,
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
    existing = await conn.fetchrow(
        "SELECT id FROM organizations WHERE id = $1",
        org_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    await require_org_write_access(
        current_user,
        org_id,
        conn,
        allowed_org_roles=("DIRECTOR",),
    )

    fields = {k: v for k, v in payload.model_dump().items() if v is not None}
    if fields:
        set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(fields))
        await conn.execute(
            f"UPDATE organizations SET {set_clause} WHERE id = $1",
            org_id,
            *fields.values(),
        )

    row = await conn.fetchrow(
        """
        SELECT o.id, o.name, o.director_name, o.governance_body, o.founder, b.address
        FROM organizations o
        LEFT JOIN LATERAL (
            SELECT address
            FROM buildings
            WHERE organization_id = o.id
            LIMIT 1
        ) b ON TRUE
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
    existing = await conn.fetchrow(
        "SELECT id, organization_id FROM buildings WHERE id = $1",
        building_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Building not found",
        )

    await require_org_write_access(
        current_user,
        existing["organization_id"],
        conn,
        allowed_org_roles=("DIRECTOR",),
    )

    fields = {k: v for k, v in payload.model_dump().items() if v is not None}
    if fields:
        set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(fields))
        await conn.execute(
            f"UPDATE buildings SET {set_clause} WHERE id = $1",
            building_id,
            *fields.values(),
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


@router.put("/incidents/{incident_id}")
async def update_incident(
    incident_id: int,
    payload: IncidentUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow(
        "SELECT id, organization_id FROM incidents WHERE id = $1",
        incident_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    await require_org_write_access(
        current_user,
        existing["organization_id"],
        conn,
        allowed_org_roles=("DIRECTOR", "STAFF"),
    )

    fields = {k: v for k, v in payload.model_dump().items() if v is not None}
    if fields:
        set_parts = []
        values = [incident_id]
        idx = 2

        for key, value in fields.items():
            if key == "incident_date":
                set_parts.append(f"{key} = ${idx}::date")
            else:
                set_parts.append(f"{key} = ${idx}")
            values.append(value)
            idx += 1

        set_parts.append("updated_at = NOW()")
        set_clause = ", ".join(set_parts)

        await conn.execute(
            f"UPDATE incidents SET {set_clause} WHERE id = $1",
            *values,
        )

    row = await conn.fetchrow(
        """
        SELECT
            i.id,
            i.organization_id,
            o.name AS organization,
            i.title,
            i.description,
            i.status,
            i.severity,
            i.incident_date,
            i.created_by_user_id,
            i.created_at,
            i.updated_at
        FROM incidents i
        JOIN organizations o ON o.id = i.organization_id
        WHERE i.id = $1
        """,
        incident_id,
    )
    return dict(row)



@router.delete("/incidents/{incident_id}")
async def delete_incident(
    incident_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow(
        "SELECT id, organization_id FROM incidents WHERE id = $1",
        incident_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    await require_org_write_access(
        current_user,
        existing["organization_id"],
        conn,
        allowed_org_roles=("DIRECTOR",),
    )

    await conn.execute(
        "DELETE FROM incidents WHERE id = $1",
        incident_id,
    )

    return {"ok": True}
    


# ── Events / Calendar ─────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    organization_id: int
    title: str
    starts_at: datetime
    ends_at: Optional[datetime] = None
    description: Optional[str] = None
    participant_ids: List[int] = []

class EventUpdate(BaseModel):
    title: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    description: Optional[str] = None
    participant_ids: Optional[List[int]] = None

_EVENT_SELECT = """
    SELECT
        e.id, e.organization_id, o.name AS organization,
        e.title, e.starts_at, e.ends_at, e.description,
        e.created_by, e.created_at,
        COALESCE(
            jsonb_agg(
                jsonb_build_object('id', u.id, 'last_name', u.last_name, 'first_name', u.first_name)
            ) FILTER (WHERE u.id IS NOT NULL),
            '[]'::jsonb
        ) AS participants
    FROM events e
    JOIN organizations o ON o.id = e.organization_id
    LEFT JOIN event_participants ep ON ep.event_id = e.id
    LEFT JOIN users u ON u.id = ep.user_id
"""

@router.get("/events")
async def list_events(
    month: Optional[str] = Query(None, description="YYYY-MM"),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    org_ids = await get_user_org_ids(current_user["id"], conn) if is_org_scoped_user(current_user) else None

    where = "WHERE ($1::bigint[] IS NULL OR e.organization_id = ANY($1))"
    params: list = [org_ids]

    if month:
        try:
            d = datetime.strptime(month, "%Y-%m")
            next_m = datetime(d.year + 1, 1, 1) if d.month == 12 else datetime(d.year, d.month + 1, 1)
            where += " AND e.starts_at >= $2 AND e.starts_at < $3"
            params += [d, next_m]
        except Exception:
            pass

    rows = await conn.fetch(
        f"{_EVENT_SELECT} {where} GROUP BY e.id, o.name ORDER BY e.starts_at",
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/events/upcoming")
async def upcoming_events(
    limit: int = Query(3, ge=1, le=10),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    org_ids = await get_user_org_ids(current_user["id"], conn) if is_org_scoped_user(current_user) else None
    rows = await conn.fetch(
        f"""
        {_EVENT_SELECT}
        WHERE e.starts_at >= NOW()
          AND ($1::bigint[] IS NULL OR e.organization_id = ANY($1))
        GROUP BY e.id, o.name
        ORDER BY e.starts_at
        LIMIT $2
        """,
        org_ids, limit,
    )
    return [dict(r) for r in rows]


@router.get("/events/org-users")
async def org_users_for_events(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    """Users in same organizations as current user — for participant picker."""
    org_ids = await get_user_org_ids(current_user["id"], conn)
    if not org_ids:
        return []
    rows = await conn.fetch(
        """
        SELECT DISTINCT u.id, u.last_name, u.first_name, u.middle_name, u.email
        FROM organization_users ou
        JOIN users u ON u.id = ou.user_id
        WHERE ou.organization_id = ANY($1)
          AND u.is_active = TRUE
        ORDER BY u.last_name, u.first_name
        """,
        org_ids,
    )
    return [dict(r) for r in rows]


@router.post("/events", status_code=201)
async def create_event(
    payload: EventCreate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    await require_org_write_access(
        current_user, payload.organization_id, conn,
        allowed_org_roles=("DIRECTOR", "STAFF"),
    )

    event = await conn.fetchrow(
        """
        INSERT INTO events (organization_id, title, starts_at, ends_at, description, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        """,
        payload.organization_id, payload.title, payload.starts_at,
        payload.ends_at, payload.description, current_user["id"],
    )
    eid = event["id"]

    if payload.participant_ids:
        await conn.executemany(
            "INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [(eid, uid) for uid in payload.participant_ids],
        )

    row = await conn.fetchrow(
        f"{_EVENT_SELECT} WHERE e.id = $1 GROUP BY e.id, o.name", eid
    )
    return dict(row)


@router.put("/events/{event_id}")
async def update_event(
    event_id: int,
    payload: EventUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow("SELECT id, organization_id FROM events WHERE id = $1", event_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")

    await require_org_write_access(
        current_user, existing["organization_id"], conn,
        allowed_org_roles=("DIRECTOR", "STAFF"),
    )

    fields = {k: v for k, v in payload.model_dump(exclude={"participant_ids"}).items() if v is not None}
    if fields:
        set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(fields))
        await conn.execute(f"UPDATE events SET {set_clause} WHERE id = $1", event_id, *fields.values())

    if payload.participant_ids is not None:
        await conn.execute("DELETE FROM event_participants WHERE event_id = $1", event_id)
        if payload.participant_ids:
            await conn.executemany(
                "INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                [(event_id, uid) for uid in payload.participant_ids],
            )

    row = await conn.fetchrow(
        f"{_EVENT_SELECT} WHERE e.id = $1 GROUP BY e.id, o.name", event_id
    )
    return dict(row)


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow("SELECT id, organization_id FROM events WHERE id = $1", event_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")

    await require_org_write_access(
        current_user, existing["organization_id"], conn,
        allowed_org_roles=("DIRECTOR", "STAFF"),
    )
    await conn.execute("DELETE FROM events WHERE id = $1", event_id)
    return {"ok": True}
