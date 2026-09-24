"""Общие проверки доступа к задаче — используются и ручками задач, и чатом."""

from fastapi import HTTPException, status

from app.api.security import has_global_full_access
from app.api.permissions import (
    ORG_MANAGER_ROLES,
    ORG_RESPONSIBLE,
    ORG_TASK_SUPERVISOR_ROLES,
    get_membership_for_org,
    has_global_readonly_access,
)


async def load_task(conn, task_id: int) -> dict:
    """Задача по id или 404."""
    row = await conn.fetchrow(
        """
        SELECT id, organization_id, title, status, created_by_user_id
        FROM tasks
        WHERE id = $1
        """,
        task_id,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    return dict(row)


async def org_role(conn, current_user: dict, organization_id: int) -> str | None:
    """Роль пользователя в организации или None, если он в ней не состоит."""
    membership = await get_membership_for_org(current_user["id"], organization_id, conn)
    return membership["org_role_code"] if membership else None


async def org_permissions(conn, current_user: dict, organization_id: int) -> dict:
    """Что пользователь может делать с задачами организации в целом.

    Один источник правды и для бэкенда, и для фронта (через /tasks/context):
    раньше фронт угадывал права, дёргая ручку и глядя на 403.
    """
    is_admin = has_global_full_access(current_user)
    is_readonly = has_global_readonly_access(current_user)
    role = await org_role(conn, current_user, organization_id)

    supervisor = role in ORG_TASK_SUPERVISOR_ROLES
    return {
        "org_role_code": role,
        # видит все задачи организации, а не только свои
        "can_view_all": is_admin or is_readonly or supervisor,
        # может перевести задачу в «Завершена» и вернуть её оттуда
        "can_complete": is_admin or supervisor,
        # может удалить чужую задачу (свою автор удаляет всегда)
        "can_delete_any": is_admin or role == ORG_RESPONSIBLE,
        # управляет организацией: здания, роли сотрудников
        "can_manage": is_admin or role in ORG_MANAGER_ROLES,
        # участвует в работе: создаёт задачи, пишет в чат
        "can_write": not is_readonly and (is_admin or role is not None),
    }


async def task_membership_flags(
    current_user: dict,
    organization_id: int,
    task_id: int | None,
    created_by_user_id: int | None,
    conn,
):
    """Возвращает (is_privileged, is_creator, is_participant) для проверки прав на задачу.

    Флаги только вычисляются — исключение бросает вызывающий эндпоинт,
    иначе участник задачи без подходящего членства в ОО никогда бы не прошёл проверку.
    """
    if has_global_full_access(current_user):
        is_privileged = True
    else:
        role = await org_role(conn, current_user, organization_id)
        is_privileged = role in ORG_TASK_SUPERVISOR_ROLES

    is_creator = created_by_user_id is not None and current_user["id"] == created_by_user_id

    is_participant = False
    if task_id is not None:
        row = await conn.fetchrow(
            "SELECT 1 FROM task_participants WHERE task_id = $1 AND user_id = $2",
            task_id, current_user["id"],
        )
        is_participant = row is not None

    return is_privileged, is_creator, is_participant


async def ensure_task_access(conn, current_user: dict, task: dict, *, write: bool) -> None:
    """Доступ к задаче и её чату.

    Читать может участник, автор, Ответственный/Директор/Администратор ОО, а также
    глобальный администратор и Минобр. Писать — все они, кроме read-only ролей.

    На чужую задачу отвечаем 404, как на несуществующую: иначе по разнице
    403/404 перебором id можно было узнать, сколько задач в системе.
    """
    if write and has_global_readonly_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only role",
        )

    if not write and has_global_readonly_access(current_user):
        return

    is_privileged, is_creator, is_participant = await task_membership_flags(
        current_user, task["organization_id"], task["id"], task["created_by_user_id"], conn,
    )
    if not (is_privileged or is_creator or is_participant):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
