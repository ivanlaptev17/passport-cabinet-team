"""Общие проверки доступа к задаче — используются и ручками задач, и чатом."""

from fastapi import HTTPException, status

from app.api.security import has_global_full_access
from app.api.permissions import (
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
        membership = await get_membership_for_org(current_user["id"], organization_id, conn)
        is_privileged = membership is not None and membership["org_role_code"] in ("DIRECTOR", "RESPONSIBLE")

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

    Читать может участник, автор, Ответственный/Администратор ОО, а также
    глобальный администратор и Минобр. Писать — все они, кроме read-only ролей.
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
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ к задаче есть у её участников, автора и Ответственного ОО",
        )
