"""Единый обработчик событий задачи.

Одно событие порождает две вещи сразу: запись в чате и уведомления нужным людям.
Всё, что пишет в task_messages и task_notifications, живёт здесь — иначе чат
и колокольчик со временем разъедутся по логике.

Порядок работы вызывающего кода:

    async with conn.transaction():
        ...изменение задачи...
        events = await record_system_event(conn, task, "STATUS_CHANGED", user_id, payload)
    await publish_events(task["id"], events)

Публикация в редис — строго после коммита, иначе подписчик может прийти за данными,
которых ещё нет в базе.
"""

import json
from typing import Iterable

from app.api import push, redis_client
from app.api.permissions import ORG_TASK_SUPERVISOR_ROLES


# ── Выборки (переиспользуются ручками чата и уведомлений) ─────────────────────

# file_path наружу не отдаём: это путь на диске сервера, клиенту хватает признака
# наличия файла и ручки скачивания
MESSAGE_SELECT = """
    SELECT
        m.id,
        m.task_id,
        m.message_type,
        m.author_user_id,
        au.last_name   AS author_last_name,
        au.first_name  AS author_first_name,
        au.middle_name AS author_middle_name,
        m.body,
        m.event_type,
        m.event_payload,
        m.file_name,
        m.file_size,
        m.file_mime,
        (m.file_path IS NOT NULL) AS has_file,
        (m.file_thumb_path IS NOT NULL) AS has_preview,
        m.created_at
    FROM task_messages m
    LEFT JOIN users au ON au.id = m.author_user_id
"""

NOTIFICATION_SELECT = """
    SELECT
        n.id,
        n.recipient_user_id,
        n.task_id,
        t.title AS task_title,
        n.message_id,
        n.notification_type,
        n.actor_user_id,
        ac.last_name  AS actor_last_name,
        ac.first_name AS actor_first_name,
        n.payload,
        n.created_at,
        n.read_at
    FROM task_notifications n
    JOIN tasks t ON t.id = n.task_id
    LEFT JOIN users ac ON ac.id = n.actor_user_id
"""


# ── Аудитория события ─────────────────────────────────────────────────────────

async def task_audience(conn, task: dict) -> set[int]:
    """Кого касается задача: её участники плюс автор."""
    rows = await conn.fetch(
        "SELECT user_id FROM task_participants WHERE task_id = $1",
        task["id"],
    )
    audience = {r["user_id"] for r in rows}
    if task.get("created_by_user_id"):
        audience.add(task["created_by_user_id"])
    return audience


async def org_supervisors(conn, organization_id: int) -> set[int]:
    """Те, кто закрывает задачи: Ответственный, Директор и Администратор ОО.

    Им уходит задача на проверку — ровно тем, кто может перевести её в «Завершена».
    """
    rows = await conn.fetch(
        """
        SELECT user_id
        FROM organization_memberships
        WHERE organization_id = $1
          AND is_active = TRUE
          AND org_role_code = ANY($2::text[])
        """,
        organization_id, list(ORG_TASK_SUPERVISOR_ROLES),
    )
    return {r["user_id"] for r in rows}


# ── Запись в чат ──────────────────────────────────────────────────────────────

async def _insert_message(
    conn,
    *,
    task_id: int,
    message_type: str,
    author_user_id: int | None = None,
    body: str | None = None,
    event_type: str | None = None,
    event_payload: dict | None = None,
    file_path: str | None = None,
    file_name: str | None = None,
    file_size: int | None = None,
    file_mime: str | None = None,
    file_thumb_path: str | None = None,
) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO task_messages (
            task_id, message_type, author_user_id, body,
            event_type, event_payload,
            file_path, file_name, file_size, file_mime, file_thumb_path
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
        RETURNING id
        """,
        task_id,
        message_type,
        author_user_id,
        body,
        event_type,
        json.dumps(event_payload) if event_payload is not None else None,
        file_path,
        file_name,
        file_size,
        file_mime,
        file_thumb_path,
    )
    message = await conn.fetchrow(f"{MESSAGE_SELECT} WHERE m.id = $1", row["id"])
    return dict(message)


# ── Уведомления ───────────────────────────────────────────────────────────────

async def _insert_notifications(
    conn,
    *,
    task_id: int,
    recipients: Iterable[int],
    notification_type: str,
    actor_user_id: int | None,
    message_id: int | None = None,
    payload: dict | None = None,
) -> list[dict]:
    """Одна строка на получателя. Уведомления о новых сообщениях схлопываются."""
    user_ids = sorted({uid for uid in recipients if uid})
    if not user_ids:
        return []

    if notification_type == "NEW_MESSAGE":
        # Непрочитанное уведомление по этой задаче уже есть — обновляем его
        # и увеличиваем счётчик, вместо того чтобы плодить строки на каждое сообщение
        insert_sql = """
            INSERT INTO task_notifications
                (recipient_user_id, task_id, message_id, notification_type, actor_user_id, payload)
            SELECT r, $2, $3, $4, $5, $6::jsonb
            FROM unnest($1::bigint[]) AS r
            ON CONFLICT (recipient_user_id, task_id)
                WHERE notification_type = 'NEW_MESSAGE' AND read_at IS NULL
            DO UPDATE SET
                message_id = EXCLUDED.message_id,
                actor_user_id = EXCLUDED.actor_user_id,
                created_at = NOW(),
                payload = jsonb_set(
                    task_notifications.payload,
                    '{unread_count}',
                    to_jsonb(COALESCE((task_notifications.payload ->> 'unread_count')::int, 0) + 1)
                )
            RETURNING id
        """
        payload = {**(payload or {}), "unread_count": 1}
    else:
        insert_sql = """
            INSERT INTO task_notifications
                (recipient_user_id, task_id, message_id, notification_type, actor_user_id, payload)
            SELECT r, $2, $3, $4, $5, $6::jsonb
            FROM unnest($1::bigint[]) AS r
            RETURNING id
        """

    rows = await conn.fetch(
        insert_sql,
        user_ids,
        task_id,
        message_id,
        notification_type,
        actor_user_id,
        json.dumps(payload or {}),
    )
    ids = [r["id"] for r in rows]
    if not ids:
        return []

    enriched = await conn.fetch(
        f"{NOTIFICATION_SELECT} WHERE n.id = ANY($1::bigint[]) ORDER BY n.id",
        ids,
    )
    return [dict(r) for r in enriched]


def _events_for(message: dict | None, notifications: list[dict]) -> list[tuple[str, dict]]:
    """Что разослать в редис: сообщение — в канал задачи, уведомления — по личным каналам."""
    events: list[tuple[str, dict]] = []
    if message is not None:
        events.append((
            redis_client.task_channel(message["task_id"]),
            {"type": "message", "message": message},
        ))
    for notification in notifications:
        events.append((
            redis_client.user_channel(notification["recipient_user_id"]),
            {"type": "notification", "notification": notification},
        ))
    return events


# ── Публичное API ─────────────────────────────────────────────────────────────

async def record_system_event(
    conn,
    task: dict,
    event_type: str,
    actor_user_id: int | None,
    payload: dict | None = None,
    recipients: Iterable[int] | None = None,
) -> list[tuple[str, dict]]:
    """Служебное сообщение в чат + уведомления аудитории задачи (кроме инициатора)."""
    message = await _insert_message(
        conn,
        task_id=task["id"],
        message_type="SYSTEM",
        event_type=event_type,
        event_payload=payload,
    )

    if recipients is None:
        recipients = await task_audience(conn, task)
    targets = {uid for uid in recipients if uid and uid != actor_user_id}

    notifications = await _insert_notifications(
        conn,
        task_id=task["id"],
        recipients=targets,
        notification_type=event_type,
        actor_user_id=actor_user_id,
        message_id=message["id"],
        payload=payload,
    )
    return _events_for(message, notifications)


async def record_user_message(
    conn,
    task: dict,
    author_user_id: int,
    body: str | None = None,
    file_info: dict | None = None,
) -> tuple[dict, list[tuple[str, dict]]]:
    """Сообщение человека в чат + уведомления остальным.

    Автору уведомление о собственном сообщении не приходит.
    """
    message = await _insert_message(
        conn,
        task_id=task["id"],
        message_type="USER",
        author_user_id=author_user_id,
        body=body,
        **(file_info or {}),
    )

    audience = await task_audience(conn, task)
    targets = audience - {author_user_id}

    notifications = await _insert_notifications(
        conn,
        task_id=task["id"],
        recipients=targets,
        notification_type="NEW_MESSAGE",
        actor_user_id=author_user_id,
        message_id=message["id"],
    )
    return message, _events_for(message, notifications)


async def notify(
    conn,
    task: dict,
    notification_type: str,
    actor_user_id: int | None,
    recipients: Iterable[int],
    payload: dict | None = None,
) -> list[tuple[str, dict]]:
    """Только уведомления, без записи в чат.

    Нужно, когда служебное сообщение уже написано, а оповестить надо кого-то ещё:
    например, задачу отправили на проверку — Ответственному ОО.
    """
    targets = {uid for uid in recipients if uid and uid != actor_user_id}
    notifications = await _insert_notifications(
        conn,
        task_id=task["id"],
        recipients=targets,
        notification_type=notification_type,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return _events_for(None, notifications)


async def publish_events(task_id: int, events: list[tuple[str, dict]]) -> None:
    """Рассылка после коммита: сбрасываем кэш истории, публикуем в каналы
    и отправляем push на устройства — тем, у кого вкладка закрыта."""
    if not events:
        return
    await redis_client.cache_drop(redis_client.task_messages_cache_key(task_id))

    messages: dict[int, dict] = {}
    notifications: list[dict] = []
    for channel, payload in events:
        await redis_client.publish(channel, payload)
        if payload["type"] == "message":
            messages[payload["message"]["id"]] = payload["message"]
        elif payload["type"] == "notification":
            notifications.append(payload["notification"])

    # В фоне: отправка через внешние push-сервисы не должна задерживать ответ
    push.schedule_notifications(notifications, messages)
