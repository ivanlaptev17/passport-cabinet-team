from typing import Optional, List
from datetime import datetime, timezone as _tz

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from app.api.database.db import get_connection
from app.api.security import get_current_user, has_global_full_access
from app.api.permissions import (
    get_membership_for_org,
    get_user_org_ids,
    has_global_readonly_access,
    require_org_view_access,
    require_org_write_access,
)
from app.api.routes.tasks import events, storage
from app.api.routes.tasks.access import task_membership_flags as _task_membership_flags


router = APIRouter(prefix="/tasks", tags=["tasks"])


TASK_STATUSES = {"NEW", "IN_PROGRESS", "PENDING_REVIEW", "DONE"}


# ── Request models ────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    organization_id: int
    building_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    severity: str = "MEDIUM"
    due_at: Optional[datetime] = None


class TaskParticipantsUpdate(BaseModel):
    user_ids: List[int] = []


class TaskStatusUpdate(BaseModel):
    status: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _naive(dt: datetime | None) -> datetime | None:
    """Strip timezone so asyncpg can write to TIMESTAMP WITHOUT TIME ZONE columns."""
    if dt is None or dt.tzinfo is None:
        return dt
    return dt.astimezone(_tz.utc).replace(tzinfo=None)


_TASK_STATUS_ORDER = "CASE t.status WHEN 'NEW' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'PENDING_REVIEW' THEN 2 WHEN 'DONE' THEN 3 ELSE 4 END"

_TASK_SELECT = """
    SELECT
        t.id,
        t.organization_id,
        o.name AS organization,
        t.building_id,
        b.name AS building_name,
        t.title,
        t.description,
        t.status,
        t.severity,
        t.due_at,
        t.created_by_user_id,
        cu.last_name AS creator_last_name,
        cu.first_name AS creator_first_name,
        t.created_at,
        t.updated_at,
        COALESCE(
            jsonb_agg(
                jsonb_build_object('id', pu.id, 'last_name', pu.last_name, 'first_name', pu.first_name)
            ) FILTER (WHERE pu.id IS NOT NULL),
            '[]'::jsonb
        ) AS participants
    FROM tasks t
    JOIN organizations o ON o.id = t.organization_id
    LEFT JOIN buildings b ON b.id = t.building_id
    LEFT JOIN users cu ON cu.id = t.created_by_user_id
    LEFT JOIN task_participants tp ON tp.task_id = t.id
    LEFT JOIN users pu ON pu.id = tp.user_id
"""
_TASK_GROUP_BY = "GROUP BY t.id, o.name, b.name, cu.last_name, cu.first_name"


# Расчёт прав на задачу живёт в access.py — его переиспользует чат


# ── Задачи ────────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    # Создавать задачу может любой активный сотрудник организации
    await require_org_write_access(
        current_user,
        payload.organization_id,
        conn,
        allowed_org_roles=("DIRECTOR", "STAFF", "RESPONSIBLE"),
    )

    # Здание должно принадлежать той же организации — FK этого не гарантирует
    if payload.building_id is not None:
        building_ok = await conn.fetchval(
            "SELECT 1 FROM buildings WHERE id = $1 AND organization_id = $2",
            payload.building_id, payload.organization_id,
        )
        if not building_ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Здание не принадлежит указанной организации",
            )

    async with conn.transaction():
        row = await conn.fetchrow(
            """
            INSERT INTO tasks (
                organization_id,
                building_id,
                title,
                description,
                status,
                severity,
                due_at,
                created_by_user_id
            )
            VALUES ($1, $2, $3, $4, 'NEW', $5, $6, $7)
            RETURNING id, organization_id, created_by_user_id
            """,
            payload.organization_id,
            payload.building_id,
            payload.title,
            payload.description,
            payload.severity,
            _naive(payload.due_at),
            current_user["id"],
        )
        task = dict(row)
        task_id = task["id"]

        # Первая запись в чате задачи. Уведомлений тут нет: кроме автора в задаче
        # ещё никого нет, а автору о собственном действии не сообщаем
        outgoing = await events.record_system_event(
            conn, task, "TASK_CREATED", current_user["id"],
        )

    await events.publish_events(task_id, outgoing)

    result = await conn.fetchrow(
        f"{_TASK_SELECT} WHERE t.id = $1 {_TASK_GROUP_BY}",
        task_id,
    )
    return dict(result)


@router.delete("/{task_id}")
async def delete_task(
    task_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow(
        "SELECT id, organization_id, created_by_user_id FROM tasks WHERE id = $1",
        task_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # По текущей постановке удалять задачу может только автор или Ответственный ОО.
    # Администратор ОО (org_role_code = 'DIRECTOR') намеренно НЕ включён —
    # если заказчик передумает, достаточно добавить 'DIRECTOR' в проверку ниже.
    if not has_global_full_access(current_user):
        is_creator = existing["created_by_user_id"] is not None and current_user["id"] == existing["created_by_user_id"]
        membership = await get_membership_for_org(current_user["id"], existing["organization_id"], conn)
        is_responsible = membership is not None and membership["org_role_code"] == "RESPONSIBLE"
        if not (is_creator or is_responsible):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Удалить задачу может только её автор или Ответственный ОО",
            )

    # Участники, сообщения и уведомления удалятся каскадом по внешнему ключу
    await conn.execute(
        "DELETE FROM tasks WHERE id = $1",
        task_id,
    )
    # А вот файлы с диска каскад не уносит
    storage.remove_task_files(existing["organization_id"], task_id)

    return {"ok": True}


@router.put("/{task_id}/participants")
async def set_task_participants(
    task_id: int,
    payload: TaskParticipantsUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow(
        "SELECT id, organization_id, created_by_user_id FROM tasks WHERE id = $1",
        task_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    if has_global_readonly_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only role",
        )

    # Добавлять и удалять участников может любой участник задачи, её автор
    # или Ответственный ОО / Администратор ОО
    is_privileged, is_creator, is_participant = await _task_membership_flags(
        current_user, existing["organization_id"], task_id, existing["created_by_user_id"], conn,
    )
    if not (is_privileged or is_creator or is_participant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Управлять участниками может участник задачи, её автор или Ответственный ОО",
        )

    user_ids = list(dict.fromkeys(payload.user_ids))  # de-dupe, preserve order

    previous = await conn.fetch(
        "SELECT user_id FROM task_participants WHERE task_id = $1",
        task_id,
    )
    previous_ids = {r["user_id"] for r in previous}
    added = [uid for uid in user_ids if uid not in previous_ids]
    removed = sorted(previous_ids - set(user_ids))

    # Добавлять можно только сотрудников этой же организации. Уже состоящих
    # в задаче не проверяем: если сотрудника деактивировали, список всё равно
    # должен сохраняться, а не падать с ошибкой
    if added:
        allowed = await conn.fetch(
            """
            SELECT user_id
            FROM organization_memberships
            WHERE organization_id = $1
              AND is_active = TRUE
              AND user_id = ANY($2::bigint[])
            """,
            existing["organization_id"], added,
        )
        allowed_ids = {r["user_id"] for r in allowed}
        if any(uid not in allowed_ids for uid in added):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Участником можно сделать только сотрудника этой организации",
            )

    names = {}
    if added or removed:
        name_rows = await conn.fetch(
            """
            SELECT id, last_name, first_name, middle_name
            FROM users
            WHERE id = ANY($1::bigint[])
            """,
            added + removed,
        )
        names = {r["id"]: dict(r) for r in name_rows}

    outgoing = []
    async with conn.transaction():
        await conn.execute("DELETE FROM task_participants WHERE task_id = $1", task_id)
        if user_ids:
            await conn.executemany(
                "INSERT INTO task_participants (task_id, user_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                [(task_id, uid, current_user["id"]) for uid in user_ids],
            )

        # Уведомляем только самого человека: его добавили в задачу или убрали из неё.
        # Остальные увидят это служебным сообщением, когда откроют чат
        for event_type, changed in (("PARTICIPANT_ADDED", added), ("PARTICIPANT_REMOVED", removed)):
            for uid in changed:
                person = names.get(uid, {})
                outgoing += await events.record_system_event(
                    conn,
                    dict(existing),
                    event_type,
                    current_user["id"],
                    {
                        "user_id": uid,
                        "last_name": person.get("last_name"),
                        "first_name": person.get("first_name"),
                        "middle_name": person.get("middle_name"),
                    },
                    recipients=[uid],
                )

    await events.publish_events(task_id, outgoing)

    row = await conn.fetchrow(
        f"{_TASK_SELECT} WHERE t.id = $1 {_TASK_GROUP_BY}",
        task_id,
    )
    return dict(row)


@router.put("/{task_id}/status")
async def set_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow(
        "SELECT id, organization_id, created_by_user_id FROM tasks WHERE id = $1",
        task_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    if has_global_readonly_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only role",
        )

    if payload.status not in TASK_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Недопустимый статус задачи",
        )

    is_privileged, is_creator, is_participant = await _task_membership_flags(
        current_user, existing["organization_id"], task_id, existing["created_by_user_id"], conn,
    )
    if not (is_privileged or is_creator or is_participant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Менять статус может участник задачи, её автор или Ответственный ОО",
        )

    task = dict(existing)
    outgoing = []
    async with conn.transaction():
        # Условие на смену статуса держит сам UPDATE: читать статус отдельным
        # запросом нельзя — два одновременных запроса прошли бы проверку оба
        # и записали в чат по событию каждый
        changed = await conn.fetchrow(
            """
            UPDATE tasks AS t
            SET status = $2, updated_at = NOW()
            FROM tasks AS previous
            WHERE t.id = $1
              AND previous.id = t.id
              AND t.status IS DISTINCT FROM $2
            RETURNING previous.status AS previous_status
            """,
            task_id,
            payload.status,
        )
        if changed is None:
            # Статус уже такой — второй раз о том же не сообщаем
            row = await conn.fetchrow(
                f"{_TASK_SELECT} WHERE t.id = $1 {_TASK_GROUP_BY}",
                task_id,
            )
            return dict(row)

        previous_status = changed["previous_status"]
        status_payload = {"from": previous_status, "to": payload.status}
        audience = await events.task_audience(conn, task)

        if payload.status == "PENDING_REVIEW":
            # Задачу сдали на проверку: Ответственному ОО отдельное уведомление —
            # это его сигнал проверить и закрыть. Чтобы не дублировать,
            # обычное уведомление о смене статуса ему не шлём
            supervisors = await events.org_supervisors(conn, task["organization_id"])
            outgoing += await events.record_system_event(
                conn, task, "STATUS_CHANGED", current_user["id"], status_payload,
                recipients=audience - supervisors,
            )
            outgoing += await events.notify(
                conn, task, "TASK_PENDING_REVIEW", current_user["id"],
                recipients=supervisors, payload=status_payload,
            )
        else:
            outgoing += await events.record_system_event(
                conn, task, "STATUS_CHANGED", current_user["id"], status_payload,
                recipients=audience,
            )

    await events.publish_events(task_id, outgoing)

    row = await conn.fetchrow(
        f"{_TASK_SELECT} WHERE t.id = $1 {_TASK_GROUP_BY}",
        task_id,
    )
    return dict(row)


@router.get("/my")
async def list_my_tasks(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    org_ids = await get_user_org_ids(current_user["id"], conn)
    rows = await conn.fetch(
        f"""
        {_TASK_SELECT}
        WHERE t.organization_id = ANY($1::bigint[])
          AND (
              t.created_by_user_id = $2
              OR EXISTS (
                  SELECT 1 FROM task_participants tpm
                  WHERE tpm.task_id = t.id AND tpm.user_id = $2
              )
          )
        {_TASK_GROUP_BY}
        ORDER BY {_TASK_STATUS_ORDER}, t.due_at NULLS LAST, t.id DESC
        """,
        org_ids,
        current_user["id"],
    )
    return [dict(r) for r in rows]


@router.get("/org")
async def list_org_tasks(
    organization_id: int = Query(...),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    membership = await require_org_view_access(current_user, organization_id, conn)

    # Все задачи организации видит только Ответственный ОО / Администратор ОО
    # или глобальный администратор / Минобр
    is_global = has_global_full_access(current_user) or has_global_readonly_access(current_user)
    if not is_global and (membership is None or membership["org_role_code"] not in ("DIRECTOR", "RESPONSIBLE")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно только Ответственному ОО, Администратору ОО или администратору системы",
        )

    rows = await conn.fetch(
        f"""
        {_TASK_SELECT}
        WHERE t.organization_id = $1
        {_TASK_GROUP_BY}
        ORDER BY {_TASK_STATUS_ORDER}, t.due_at NULLS LAST, t.id DESC
        """,
        organization_id,
    )
    return [dict(r) for r in rows]


@router.get("/org-users")
async def list_org_users(
    organization_id: Optional[int] = Query(None),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    """Список людей организации для выбора участников — сгруппирован по зданиям."""
    if organization_id is not None:
        await require_org_view_access(current_user, organization_id, conn)
        org_ids = [organization_id]
    else:
        org_ids = await get_user_org_ids(current_user["id"], conn)

    rows = await conn.fetch(
        """
        SELECT
            om.building_id,
            b.name AS building_name,
            u.id,
            u.last_name,
            u.first_name,
            u.middle_name,
            u.email
        FROM organization_memberships om
        JOIN users u ON u.id = om.user_id
        LEFT JOIN buildings b ON b.id = om.building_id
        WHERE om.organization_id = ANY($1::bigint[])
          AND om.is_active = TRUE
        ORDER BY b.name NULLS LAST, u.last_name, u.first_name
        """,
        org_ids,
    )

    groups: list[dict] = []
    index: dict[int | None, dict] = {}
    for row in rows:
        key = row["building_id"]
        group = index.get(key)
        if group is None:
            group = {
                "building_id": key,
                "building_name": row["building_name"],
                "users": [],
            }
            index[key] = group
            groups.append(group)
        group["users"].append({
            "id": row["id"],
            "last_name": row["last_name"],
            "first_name": row["first_name"],
            "middle_name": row["middle_name"],
            "email": row["email"],
        })

    return groups
