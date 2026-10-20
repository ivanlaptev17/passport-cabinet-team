"""Отпуска и дни рождения сотрудников.

Раздел для Директора, Ответственного и Администратора ОО: смотрят и заполняют.
Министерство смотрит, администратор системы может всё. Строки — все сотрудники
из кадрового состава, к ним добавлены отпуска, замы и дата рождения.

Дни рождения выводятся в календаре директора. Чтобы не пересчитывать их на каждое
открытие календаря, список на месяц кэшируется в Redis по организации и сбрасывается,
когда кто-то меняет дату рождения.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

from app.api import redis_client
from app.api.database.db import get_connection
from app.api.permissions import (
    ORG_TASK_SUPERVISOR_ROLES,
    get_user_memberships,
    has_global_full_access,
    has_global_readonly_access,
    has_global_view_access,
    scoped_org_ids,
)
from app.api.security import get_current_user
from app.api.utils.clock import today

router = APIRouter(prefix="/data", tags=["staff-calendar"])

BIRTHDAYS_TTL = 24 * 60 * 60
MAX_TEXT = 2000


class StaffCalendarUpdate(BaseModel):
    vacations: Optional[str] = None
    deputies: Optional[str] = None
    birth_date: Optional[date] = None
    # birth_date = null — «не менять», поэтому стирание даты отдельным флагом
    clear_birth_date: bool = False


def _birthdays_key(organization_id: int, month: int) -> str:
    return f"birthdays:{organization_id}:{month}"


async def _supervised_org_ids(current_user: dict, conn) -> list[int]:
    memberships = await get_user_memberships(current_user["id"], conn)
    return [m["organization_id"] for m in memberships if m["org_role_code"] in ORG_TASK_SUPERVISOR_ROLES]


async def _visible_org_ids(current_user: dict, conn) -> list[int] | None:
    """Организации, чьи отпуска и дни рождения пользователь видит. None — все."""
    scoped = await scoped_org_ids(current_user, conn)
    if has_global_view_access(current_user):
        return scoped
    supervised = set(await _supervised_org_ids(current_user, conn))
    return [org_id for org_id in scoped if org_id in supervised]


_SELECT = """
    SELECT
        e.id,
        e.organization_id,
        o.name AS organization,
        e.last_name,
        e.first_name,
        e.middle_name,
        e.fio,
        p.name AS position,
        c.code AS category_code,
        e.contacts,
        e.vacations,
        e.deputies,
        e.birth_date
    FROM employees e
    JOIN organizations o ON o.id = e.organization_id
    LEFT JOIN employee_positions ep ON ep.employee_id = e.id
    LEFT JOIN positions p ON p.id = ep.position_id
    LEFT JOIN categories c ON c.id = p.category_id
"""


@router.get("/staff-calendar")
async def list_staff_calendar(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    org_ids = await _visible_org_ids(current_user, conn)
    if org_ids is not None and not org_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Раздел доступен Директору, Ответственному и Администратору ОО",
        )

    rows = await conn.fetch(
        f"""
        {_SELECT}
        WHERE ($1::bigint[] IS NULL OR e.organization_id = ANY($1))
        ORDER BY e.last_name NULLS LAST, e.first_name, e.id
        """,
        org_ids,
    )
    return {
        "can_edit": not has_global_readonly_access(current_user),
        "employees": [dict(r) for r in rows],
    }


@router.put("/staff-calendar/{employee_id}")
async def update_staff_calendar(
    employee_id: int,
    payload: StaffCalendarUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    employee = await conn.fetchrow(
        "SELECT id, organization_id, birth_date FROM employees WHERE id = $1",
        employee_id,
    )
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден")

    if has_global_readonly_access(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Read-only role")
    if not has_global_full_access(current_user):
        if employee["organization_id"] not in await _supervised_org_ids(current_user, conn):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Заполнять раздел может Директор, Ответственный или Администратор ОО",
            )

    updates: dict[str, object] = {}
    for field in ("vacations", "deputies"):
        value = getattr(payload, field)
        if value is not None:
            if len(value) > MAX_TEXT:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Слишком длинный текст")
            updates[field] = value.strip() or None
    if payload.clear_birth_date:
        updates["birth_date"] = None
    elif payload.birth_date is not None:
        if payload.birth_date > today() or payload.birth_date.year < 1900:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Проверьте дату рождения")
        updates["birth_date"] = payload.birth_date

    if updates:
        # имена колонок — только из фиксированного набора выше
        columns = list(updates)
        assignments = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(columns))
        await conn.execute(
            f"UPDATE employees SET {assignments} WHERE id = $1",
            employee_id, *[updates[c] for c in columns],
        )

    if "birth_date" in updates:
        # кэш именинников месяца: старой даты (ушёл из месяца) и новой (появился)
        months = {d.month for d in (employee["birth_date"], updates["birth_date"]) if d}
        for month in months:
            await redis_client.cache_drop(_birthdays_key(employee["organization_id"], month))

    row = await conn.fetchrow(f"{_SELECT} WHERE e.id = $1", employee_id)
    return dict(row)


@router.get("/birthdays")
async def list_birthdays(
    month: int = Query(..., ge=1, le=12),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    """Именинники месяца для календаря. Только по выбранной организации:
    сводка по всем школам сразу в календаре директора не нужна."""
    org_ids = await _visible_org_ids(current_user, conn)
    if not org_ids:
        return []

    result: list[dict] = []
    for org_id in org_ids:
        key = _birthdays_key(org_id, month)
        cached = await redis_client.cache_get(key)
        if cached is None:
            rows = await conn.fetch(
                """
                SELECT id AS employee_id, organization_id, last_name, first_name, middle_name, birth_date
                FROM employees
                WHERE organization_id = $1
                  AND birth_date IS NOT NULL
                  AND EXTRACT(MONTH FROM birth_date) = $2
                ORDER BY EXTRACT(DAY FROM birth_date), last_name
                """,
                org_id, month,
            )
            cached = jsonable_encoder([dict(r) for r in rows])
            await redis_client.cache_set(key, cached, ttl=BIRTHDAYS_TTL)
        result.extend(cached)

    return sorted(result, key=lambda b: (b["birth_date"][5:], b.get("last_name") or ""))
