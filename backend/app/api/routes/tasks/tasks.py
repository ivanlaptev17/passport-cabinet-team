from typing import Optional, List
from datetime import datetime, timezone as _tz

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from app.api.database.db import get_connection
from app.api.security import get_current_user, has_global_full_access
from app.api.permissions import (
    ORG_MEMBER_ROLES,
    ORG_ROLE_LABELS,
    get_user_org_ids,
    has_global_readonly_access,
    require_org_view_access,
    require_org_write_access,
)
from app.api.routes.tasks import events, storage
from app.api.routes.tasks.access import (
    ensure_task_access,
    load_task,
    org_permissions,
    task_membership_flags as _task_membership_flags,
)


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
    participant_user_ids: List[int] = []
    category_ids: List[int] = []


class TaskParticipantsUpdate(BaseModel):
    user_ids: List[int] = []


class TaskStatusUpdate(BaseModel):
    status: str


class TaskCategoriesUpdate(BaseModel):
    category_ids: List[int] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _naive(dt: datetime | None) -> datetime | None:
    """Strip timezone so asyncpg can write to TIMESTAMP WITHOUT TIME ZONE columns."""
    if dt is None or dt.tzinfo is None:
        return dt
    return dt.astimezone(_tz.utc).replace(tzinfo=None)


_TASK_STATUS_ORDER = "CASE t.status WHEN 'NEW' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'PENDING_REVIEW' THEN 2 WHEN 'DONE' THEN 3 ELSE 4 END"

# Участники и категории собираются подзапросами, а не JOIN-ами: два JOIN-а на
# «многие» дали бы декартово произведение и задвоили бы элементы в массивах
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
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('id', pu.id, 'last_name', pu.last_name, 'first_name', pu.first_name)
                ORDER BY pu.last_name, pu.first_name
            )
            FROM task_participants tp
            JOIN users pu ON pu.id = tp.user_id
            WHERE tp.task_id = t.id
        ), '[]'::jsonb) AS participants,
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color)
                ORDER BY c.name
            )
            FROM task_categories tc
            JOIN org_categories c ON c.id = tc.category_id
            WHERE tc.task_id = t.id
        ), '[]'::jsonb) AS categories
    FROM tasks t
    JOIN organizations o ON o.id = t.organization_id
    LEFT JOIN buildings b ON b.id = t.building_id
    LEFT JOIN users cu ON cu.id = t.created_by_user_id
"""


async def _fetch_task(conn, task_id: int, current_user: dict) -> dict:
    """Задача вместе с правами пользователя на неё.

    Права кладём в каждый ответ, а не только в GET: фронт заменяет задачу ответом
    на смену статуса или участников, и без прав кнопки «Завершена» и «Удалить»
    гасли до перезагрузки страницы.
    """
    row = await conn.fetchrow(f"{_TASK_SELECT} WHERE t.id = $1", task_id)
    task = dict(row)
    task["permissions"] = await org_permissions(conn, current_user, task["organization_id"])
    return task


async def _ensure_members(conn, organization_id: int, user_ids: list[int]) -> None:
    """Участником можно сделать только действующего сотрудника этой же организации."""
    if not user_ids:
        return
    rows = await conn.fetch(
        """
        SELECT user_id
        FROM organization_memberships
        WHERE organization_id = $1
          AND is_active = TRUE
          AND user_id = ANY($2::bigint[])
        """,
        organization_id, user_ids,
    )
    allowed = {r["user_id"] for r in rows}
    if any(uid not in allowed for uid in user_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Участником можно сделать только сотрудника этой организации",
        )


async def _ensure_categories(conn, organization_id: int, category_ids: list[int]) -> None:
    """Категории задачи берутся только из категорий её организации."""
    if not category_ids:
        return
    rows = await conn.fetch(
        "SELECT id FROM org_categories WHERE organization_id = $1 AND id = ANY($2::bigint[])",
        organization_id, category_ids,
    )
    found = {r["id"] for r in rows}
    if any(cid not in found for cid in category_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Категория не принадлежит организации задачи",
        )


async def _people(conn, user_ids: list[int]) -> dict[int, dict]:
    if not user_ids:
        return {}
    rows = await conn.fetch(
        "SELECT id, last_name, first_name, middle_name FROM users WHERE id = ANY($1::bigint[])",
        user_ids,
    )
    return {r["id"]: dict(r) for r in rows}


def _person_payload(uid: int, people: dict[int, dict]) -> dict:
    person = people.get(uid, {})
    return {
        "user_id": uid,
        "last_name": person.get("last_name"),
        "first_name": person.get("first_name"),
        "middle_name": person.get("middle_name"),
    }


async def _require_task_worker(conn, current_user: dict, task: dict) -> None:
    """Менять задачу может участник, автор или Ответственный/Директор/Администратор ОО.

    Постороннему отвечаем 404, как и в чате: разница 403/404 выдавала бы,
    что задача с таким id существует.
    """
    if has_global_readonly_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only role",
        )
    is_privileged, is_creator, is_participant = await _task_membership_flags(
        current_user, task["organization_id"], task["id"], task["created_by_user_id"], conn,
    )
    if not (is_privileged or is_creator or is_participant):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )


# ── Контекст пользователя ─────────────────────────────────────────────────────

@router.get("/context")
async def get_task_context(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    """Организации пользователя и его права в каждой — чтобы фронт не угадывал.

    Глобальный администратор и Минобр членства не имеют, но видят все организации.
    """
    is_global = has_global_full_access(current_user) or has_global_readonly_access(current_user)
    if is_global:
        rows = await conn.fetch("SELECT id, name FROM organizations ORDER BY id")
    else:
        org_ids = await get_user_org_ids(current_user["id"], conn)
        rows = await conn.fetch(
            "SELECT id, name FROM organizations WHERE id = ANY($1::bigint[]) ORDER BY id",
            org_ids,
        )

    organizations = []
    for row in rows:
        perms = await org_permissions(conn, current_user, row["id"])
        organizations.append({
            "id": row["id"],
            "name": row["name"],
            **perms,
            "org_role_label": ORG_ROLE_LABELS.get(perms["org_role_code"] or ""),
        })

    return {
        "user_id": current_user["id"],
        "global_role": current_user.get("role_code"),
        "is_global_admin": has_global_full_access(current_user),
        "is_readonly": has_global_readonly_access(current_user),
        "organizations": organizations,
    }


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
        allowed_org_roles=ORG_MEMBER_ROLES,
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

    # Автор и так в задаче — отдельно участником его не записываем
    participant_ids = [
        uid for uid in dict.fromkeys(payload.participant_user_ids)
        if uid != current_user["id"]
    ]
    category_ids = list(dict.fromkeys(payload.category_ids))
    await _ensure_members(conn, payload.organization_id, participant_ids)
    await _ensure_categories(conn, payload.organization_id, category_ids)
    people = await _people(conn, participant_ids)

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

        if participant_ids:
            await conn.executemany(
                "INSERT INTO task_participants (task_id, user_id, added_by) VALUES ($1, $2, $3)",
                [(task_id, uid, current_user["id"]) for uid in participant_ids],
            )
        if category_ids:
            await conn.executemany(
                "INSERT INTO task_categories (task_id, category_id) VALUES ($1, $2)",
                [(task_id, cid) for cid in category_ids],
            )

        # Первая запись в чате. Самому автору о его действии не сообщаем
        outgoing = await events.record_system_event(
            conn, task, "TASK_CREATED", current_user["id"], recipients=[],
        )
        # Назначенным сразу при создании — такое же уведомление, как при добавлении позже
        for uid in participant_ids:
            outgoing += await events.record_system_event(
                conn, task, "PARTICIPANT_ADDED", current_user["id"],
                _person_payload(uid, people), recipients=[uid],
            )

    await events.publish_events(task_id, outgoing)
    return await _fetch_task(conn, task_id, current_user)


@router.get("/{task_id:int}")
async def get_task(
    task_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    task = await load_task(conn, task_id)
    await ensure_task_access(conn, current_user, task, write=False)
    return await _fetch_task(conn, task_id, current_user)


@router.delete("/{task_id:int}")
async def delete_task(
    task_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await load_task(conn, task_id)

    # По постановке удалять задачу может только автор или Ответственный ОО
    # (и глобальный администратор). Директор и Администратор ОО намеренно не включены
    is_creator = existing["created_by_user_id"] is not None and current_user["id"] == existing["created_by_user_id"]
    perms = await org_permissions(conn, current_user, existing["organization_id"])
    if not (is_creator or perms["can_delete_any"]):
        await ensure_task_access(conn, current_user, existing, write=False)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Удалить задачу может только её автор или Ответственный ОО",
        )

    # Участники, сообщения, категории и уведомления удалятся каскадом по внешнему ключу
    await conn.execute("DELETE FROM tasks WHERE id = $1", task_id)
    # А вот файлы с диска каскад не уносит
    storage.remove_task_files(existing["organization_id"], task_id)

    return {"ok": True}


@router.put("/{task_id:int}/participants")
async def set_task_participants(
    task_id: int,
    payload: TaskParticipantsUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await load_task(conn, task_id)
    await _require_task_worker(conn, current_user, existing)

    user_ids = list(dict.fromkeys(payload.user_ids))  # de-dupe, preserve order

    previous = await conn.fetch(
        "SELECT user_id FROM task_participants WHERE task_id = $1",
        task_id,
    )
    previous_ids = {r["user_id"] for r in previous}
    added = [uid for uid in user_ids if uid not in previous_ids]
    removed = sorted(previous_ids - set(user_ids))

    # Автор, редактируя задачу, не добавляет и не убирает сам себя
    author_id = existing["created_by_user_id"]
    if author_id is not None and author_id == current_user["id"] and (
        author_id in added or author_id in removed
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Автор не может добавить или убрать себя из участников",
        )

    # Уже состоящих в задаче не проверяем: если сотрудника деактивировали,
    # список всё равно должен сохраняться, а не падать с ошибкой
    await _ensure_members(conn, existing["organization_id"], added)
    people = await _people(conn, added + removed)

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
                outgoing += await events.record_system_event(
                    conn, existing, event_type, current_user["id"],
                    _person_payload(uid, people), recipients=[uid],
                )

    await events.publish_events(task_id, outgoing)
    return await _fetch_task(conn, task_id, current_user)


@router.put("/{task_id:int}/status")
async def set_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    task = await load_task(conn, task_id)
    await _require_task_worker(conn, current_user, task)

    if payload.status not in TASK_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Недопустимый статус задачи",
        )

    perms = await org_permissions(conn, current_user, task["organization_id"])

    outgoing = []
    async with conn.transaction():
        # Блокировка строки: два одновременных запроса не пройдут проверку оба
        # и не запишут в чат по событию каждый
        previous_status = await conn.fetchval(
            "SELECT status FROM tasks WHERE id = $1 FOR UPDATE",
            task_id,
        )
        if previous_status == payload.status:
            return await _fetch_task(conn, task_id, current_user)

        # «Завершена» — контрольная точка: ставит её и снимает только тот, кто
        # проверяет работу. Иначе исполнитель мог бы вернуть закрытую задачу в работу
        if (payload.status == "DONE" or previous_status == "DONE") and not perms["can_complete"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Завершить задачу или вернуть её из завершённых может только Ответственный или Администратор ОО",
            )

        await conn.execute(
            "UPDATE tasks SET status = $2, updated_at = NOW() WHERE id = $1",
            task_id, payload.status,
        )

        status_payload = {"from": previous_status, "to": payload.status}
        audience = await events.task_audience(conn, task)

        if payload.status == "PENDING_REVIEW":
            # Задачу сдали на проверку: проверяющим отдельное уведомление —
            # это их сигнал проверить и закрыть. Чтобы не дублировать,
            # обычное уведомление о смене статуса им не шлём
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
    return await _fetch_task(conn, task_id, current_user)


@router.put("/{task_id:int}/categories")
async def set_task_categories(
    task_id: int,
    payload: TaskCategoriesUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    task = await load_task(conn, task_id)
    await _require_task_worker(conn, current_user, task)

    category_ids = list(dict.fromkeys(payload.category_ids))
    await _ensure_categories(conn, task["organization_id"], category_ids)

    async with conn.transaction():
        await conn.execute("DELETE FROM task_categories WHERE task_id = $1", task_id)
        if category_ids:
            await conn.executemany(
                "INSERT INTO task_categories (task_id, category_id) VALUES ($1, $2)",
                [(task_id, cid) for cid in category_ids],
            )
        await conn.execute("UPDATE tasks SET updated_at = NOW() WHERE id = $1", task_id)

    return await _fetch_task(conn, task_id, current_user)


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
    await require_org_view_access(current_user, organization_id, conn)

    # Все задачи организации видят Ответственный, Директор и Администратор ОО,
    # а также глобальный администратор и Минобр
    perms = await org_permissions(conn, current_user, organization_id)
    if not perms["can_view_all"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно только Ответственному, Директору или Администратору ОО",
        )

    rows = await conn.fetch(
        f"""
        {_TASK_SELECT}
        WHERE t.organization_id = $1
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


@router.get("/users/{user_id:int}")
async def get_user_profile(
    user_id: int,
    organization_id: int = Query(...),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    """Карточка сотрудника: открывается по нажатию на участника задачи."""
    await require_org_view_access(current_user, organization_id, conn)

    row = await conn.fetchrow(
        """
        SELECT
            u.id,
            u.last_name,
            u.first_name,
            u.middle_name,
            u.email,
            u.phone,
            om.org_role_code,
            om.position_title,
            b.name AS building_name,
            o.name AS organization
        FROM organization_memberships om
        JOIN users u ON u.id = om.user_id
        JOIN organizations o ON o.id = om.organization_id
        LEFT JOIN buildings b ON b.id = om.building_id
        WHERE om.organization_id = $1
          AND om.user_id = $2
        """,
        organization_id, user_id,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сотрудник не найден в этой организации",
        )

    profile = dict(row)
    profile["org_role_label"] = ORG_ROLE_LABELS.get(profile["org_role_code"] or "")
    return profile
