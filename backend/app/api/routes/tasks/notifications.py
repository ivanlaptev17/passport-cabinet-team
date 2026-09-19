"""Уведомления по задачам: лента колокольчика и realtime-поток пользователя."""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from fastapi import HTTPException
from pydantic import BaseModel

from app.api import redis_client
from app.api.database.db import get_connection
from app.api.routes.tasks import events
from app.api.security import get_current_user, get_current_user_for_stream

router = APIRouter(prefix="/tasks", tags=["task-notifications"])


class NotificationsRead(BaseModel):
    ids: Optional[List[int]] = None
    all: bool = False


@router.get("/notifications")
async def list_notifications(
    only_unread: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    rows = await conn.fetch(
        f"""
        {events.NOTIFICATION_SELECT}
        WHERE n.recipient_user_id = $1
          AND ($2::bool IS FALSE OR n.read_at IS NULL)
        ORDER BY n.id DESC
        LIMIT $3
        """,
        current_user["id"], only_unread, limit,
    )

    total_unread = await conn.fetchval(
        """
        SELECT COUNT(*)
        FROM task_notifications
        WHERE recipient_user_id = $1 AND read_at IS NULL
        """,
        current_user["id"],
    )

    return {
        "total_unread": total_unread,
        "items": [dict(r) for r in rows],
    }


@router.post("/notifications/read")
async def mark_notifications_read(
    payload: NotificationsRead,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    if payload.all:
        await conn.execute(
            """
            UPDATE task_notifications
            SET read_at = NOW()
            WHERE recipient_user_id = $1 AND read_at IS NULL
            """,
            current_user["id"],
        )
    elif payload.ids:
        await conn.execute(
            """
            UPDATE task_notifications
            SET read_at = NOW()
            WHERE recipient_user_id = $1
              AND id = ANY($2::bigint[])
              AND read_at IS NULL
            """,
            current_user["id"], payload.ids,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нужно передать ids или all = true",
        )

    return {"ok": True}


@router.get("/notifications/stream")
async def stream_notifications(request: Request):
    """Личный SSE-поток уведомлений.

    Зарегистрирован раньше /tasks/{task_id}/stream — иначе путь уехал бы в него
    и task_id не прошёл бы валидацию.
    """
    current_user = await get_current_user_for_stream(request)

    channel = redis_client.user_channel(current_user["id"])
    try:
        pubsub = await redis_client.open_subscription(channel)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Realtime недоступен: нет соединения с Redis",
        )

    async def generator():
        try:
            yield ": connected\n\n"
            async for data in redis_client.listen(pubsub):
                if data is None:
                    yield ": ping\n\n"
                    continue
                yield f"data: {data}\n\n"
        finally:
            await redis_client.close_subscription(pubsub, channel)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
