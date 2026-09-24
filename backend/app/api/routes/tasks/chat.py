"""Чат задачи: история, отправка сообщений, файлы и realtime-поток."""

from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.api import redis_client
from app.api.database import db as _db
from app.api.database.db import get_connection
from app.api.routes.tasks import events, storage
from app.api.routes.tasks.access import ensure_task_access, load_task
from app.api.security import get_current_user, get_current_user_for_stream

router = APIRouter(prefix="/tasks", tags=["task-chat"])

DEFAULT_PAGE_SIZE = 50


class MessageCreate(BaseModel):
    body: str


# ── История ───────────────────────────────────────────────────────────────────

async def _fetch_page(conn, task_id: int, before_id: int | None, limit: int) -> dict:
    rows = await conn.fetch(
        f"""
        {events.MESSAGE_SELECT}
        WHERE m.task_id = $1
          AND ($2::bigint IS NULL OR m.id < $2)
        ORDER BY m.id DESC
        LIMIT $3
        """,
        task_id, before_id, limit,
    )
    # из базы берём последние сообщения (DESC), клиенту отдаём в порядке чтения
    messages = [dict(r) for r in reversed(rows)]
    return {
        "messages": messages,
        "has_more": len(rows) == limit,
        "next_before_id": messages[0]["id"] if messages else None,
    }


@router.get("/{task_id}/messages")
async def list_task_messages(
    task_id: int,
    before_id: Optional[int] = Query(None, description="Курсор: сообщения старше этого id"),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=200),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    task = await load_task(conn, task_id)
    await ensure_task_access(conn, current_user, task, write=False)

    # Кэшируем только первую страницу — именно она грузится при открытии чата.
    # Кэш сбрасывается в events.publish_events при любом новом сообщении.
    cacheable = before_id is None and limit == DEFAULT_PAGE_SIZE
    cache_key = redis_client.task_messages_cache_key(task_id)
    if cacheable:
        cached = await redis_client.cache_get(cache_key)
        if cached is not None:
            return cached

    page = await _fetch_page(conn, task_id, before_id, limit)
    if cacheable:
        await redis_client.cache_set(cache_key, jsonable_encoder(page))
    return page


# ── Отправка ──────────────────────────────────────────────────────────────────

@router.post("/{task_id}/messages", status_code=status.HTTP_201_CREATED)
async def post_task_message(
    task_id: int,
    payload: MessageCreate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    task = await load_task(conn, task_id)
    await ensure_task_access(conn, current_user, task, write=True)

    body = payload.body.strip()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сообщение не может быть пустым",
        )

    async with conn.transaction():
        message, outgoing = await events.record_user_message(
            conn, task, current_user["id"], body=body,
        )
    await events.publish_events(task_id, outgoing)

    return message


@router.post("/{task_id}/messages/file", status_code=status.HTTP_201_CREATED)
async def post_task_message_with_file(
    task_id: int,
    file: UploadFile = File(...),
    body: str = Form(""),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    task = await load_task(conn, task_id)
    await ensure_task_access(conn, current_user, task, write=True)

    file_info = await storage.save_upload(file, task["organization_id"], task_id)

    try:
        async with conn.transaction():
            message, outgoing = await events.record_user_message(
                conn, task, current_user["id"], body=(body.strip() or None), file_info=file_info,
            )
    except Exception:
        # Запись в базу не удалась — файл и превью на диске никому не нужны
        storage.remove_upload(file_info)
        raise

    await events.publish_events(task_id, outgoing)

    return message


@router.get("/{task_id}/messages/{message_id}/file")
async def download_task_message_file(
    task_id: int,
    message_id: int,
    preview: bool = Query(False, description="Уменьшенная копия картинки для ленты чата"),
    inline: bool = Query(False, description="Открыть картинку в браузере, а не скачать"),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    task = await load_task(conn, task_id)
    await ensure_task_access(conn, current_user, task, write=False)

    row = await conn.fetchrow(
        """
        SELECT file_path, file_name, file_mime, file_thumb_path
        FROM task_messages
        WHERE id = $1 AND task_id = $2
        """,
        message_id, task_id,
    )
    if row is None or not row["file_path"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Файл не найден",
        )

    # Превью есть только у файлов, которые Pillow признал настоящей картинкой.
    # Только их и отдаём inline: произвольный файл, открытый в браузере с домена API,
    # мог бы оказаться HTML со скриптом
    is_image = row["file_thumb_path"] is not None
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400"}

    if preview:
        if not is_image:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Превью нет")
        thumb = Path(row["file_thumb_path"])
        if not thumb.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Превью отсутствует на диске")
        return FileResponse(thumb, media_type="image/jpeg", headers=headers)

    path = Path(row["file_path"])
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Файл отсутствует на диске",
        )

    return FileResponse(
        path,
        filename=row["file_name"] or path.name,
        media_type=(row["file_mime"] if is_image else None) or "application/octet-stream",
        content_disposition_type="inline" if (inline and is_image) else "attachment",
        headers=headers,
    )


@router.get("/{task_id}/files")
async def list_task_files(
    task_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    """Все вложения из чата задачи — для блока «Файлы» на экране задачи."""
    task = await load_task(conn, task_id)
    await ensure_task_access(conn, current_user, task, write=False)

    rows = await conn.fetch(
        """
        SELECT
            m.id AS message_id,
            m.file_name,
            m.file_size,
            m.file_mime,
            (m.file_thumb_path IS NOT NULL) AS has_preview,
            m.author_user_id,
            u.last_name  AS author_last_name,
            u.first_name AS author_first_name,
            m.created_at
        FROM task_messages m
        LEFT JOIN users u ON u.id = m.author_user_id
        WHERE m.task_id = $1
          AND m.file_path IS NOT NULL
        ORDER BY m.id DESC
        """,
        task_id,
    )
    return [dict(r) for r in rows]


@router.post("/{task_id}/messages/read")
async def mark_task_chat_read(
    task_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    """Открыли задачу — гасим все непрочитанные уведомления по ней."""
    task = await load_task(conn, task_id)
    await ensure_task_access(conn, current_user, task, write=False)

    await conn.execute(
        """
        UPDATE task_notifications
        SET read_at = NOW()
        WHERE recipient_user_id = $1
          AND task_id = $2
          AND read_at IS NULL
        """,
        current_user["id"], task_id,
    )
    return {"ok": True}


# ── Realtime ──────────────────────────────────────────────────────────────────

@router.get("/{task_id}/stream")
async def stream_task_chat(task_id: int, request: Request):
    """SSE-поток чата: браузер держит соединение, сервер пишет в него по событию.

    Аутентификация и проверка прав — до отдачи потока, чтобы 401/403 были
    настоящими кодами ответа, а не сообщением внутри стрима.
    """
    current_user = await get_current_user_for_stream(request)

    async with _db.pool.acquire() as conn:
        task = await load_task(conn, task_id)
        await ensure_task_access(conn, current_user, task, write=False)

    channel = redis_client.task_channel(task_id)
    try:
        pubsub = await redis_client.open_subscription(channel)
    except Exception:
        # Подписываемся до отдачи ответа: иначе клиент получил бы 200
        # и оборванный поток вместо понятной ошибки
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Realtime недоступен: нет соединения с Redis",
        )

    async def generator():
        try:
            yield ": connected\n\n"
            async for data in redis_client.listen(pubsub):
                if data is None:
                    # тишина в канале — пинг, чтобы прокси не закрыл соединение
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
