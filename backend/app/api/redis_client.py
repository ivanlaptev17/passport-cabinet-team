"""Redis: pub/sub для realtime-доставки и кэш истории чата.

Источник правды — постгрес. Если редис недоступен, приложение продолжает работать:
сообщения пишутся и читаются из БД, теряется только мгновенная доставка и кэш.
Поэтому publish/cache-операции ошибки не пробрасывают.
"""

import json
import os
from typing import AsyncIterator

import redis.asyncio as aioredis
from fastapi.encoders import jsonable_encoder


def _dump(payload) -> str:
    """Сериализация ровно как у обычных ответов FastAPI.

    Важно, чтобы realtime и REST отдавали одинаковые типы: str(datetime) дал бы
    "2026-09-19 01:13:25" вместо ISO-8601, и фронт получал бы два разных формата
    одного и того же поля (в Safari такая дата вообще не парсится).
    """
    return json.dumps(jsonable_encoder(payload), ensure_ascii=False)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

client: aioredis.Redis | None = None


async def connect_to_redis() -> None:
    global client
    # from_url соединение не открывает — redis-py подключается лениво, при первой команде
    client = aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        await client.ping()
        print("✅ Connected to Redis")
    except Exception as e:
        # Клиент намеренно оставляем: как только редис поднимется, он сам переподключится,
        # рестарт бэкенда для этого не нужен
        print(f"⚠️  Redis пока недоступен ({e}) — realtime включится, когда он поднимется")


async def close_redis() -> None:
    global client
    if client is None:
        return
    try:
        closer = getattr(client, "aclose", None) or client.close
        await closer()
    except Exception:
        pass
    client = None


def is_available() -> bool:
    return client is not None


# ── Каналы ────────────────────────────────────────────────────────────────────

def task_channel(task_id: int) -> str:
    """Канал чата задачи: сюда летят новые сообщения (и пользовательские, и служебные)."""
    return f"task:{task_id}:messages"


def user_channel(user_id: int) -> str:
    """Личный канал пользователя: сюда летят его уведомления."""
    return f"user:{user_id}:notifications"


# ── Pub/sub ───────────────────────────────────────────────────────────────────

async def publish(channel: str, payload: dict) -> None:
    if client is None:
        return
    try:
        await client.publish(channel, _dump(payload))
    except Exception as e:
        print(f"⚠️  Redis publish failed ({channel}): {e}")


async def open_subscription(channel: str):
    """Подписаться на канал. Бросает исключение, если редис недоступен.

    Вызывается до отдачи StreamingResponse: иначе клиент получил бы 200 и оборванный
    на середине поток вместо честного кода ошибки.
    """
    if client is None:
        raise RuntimeError("Redis client is not initialised")

    pubsub = client.pubsub()
    await pubsub.subscribe(channel)
    return pubsub


async def listen(pubsub, heartbeat: float = 25.0) -> AsyncIterator[str | None]:
    """Чтение из уже открытой подписки.

    Отдаёт строку с полезной нагрузкой либо None, когда за heartbeat секунд ничего
    не пришло — None нужен вызывающему SSE-эндпоинту, чтобы отправить пинг
    и не дать прокси закрыть простаивающее соединение.
    """
    while True:
        message = await pubsub.get_message(
            ignore_subscribe_messages=True,
            timeout=heartbeat,
        )
        if message is None:
            yield None
            continue
        yield message["data"]


async def close_subscription(pubsub, channel: str) -> None:
    try:
        await pubsub.unsubscribe(channel)
        closer = getattr(pubsub, "aclose", None) or pubsub.close
        await closer()
    except Exception:
        pass


# ── Кэш ───────────────────────────────────────────────────────────────────────

def task_messages_cache_key(task_id: int) -> str:
    """Кэш первой (самой свежей) страницы истории чата — то, что грузится при открытии."""
    return f"task:{task_id}:messages:first_page"


async def cache_get(key: str):
    if client is None:
        return None
    try:
        raw = await client.get(key)
    except Exception as e:
        print(f"⚠️  Redis get failed ({key}): {e}")
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


async def cache_set(key: str, value, ttl: int = 300) -> None:
    if client is None:
        return
    try:
        await client.set(key, _dump(value), ex=ttl)
    except Exception as e:
        print(f"⚠️  Redis set failed ({key}): {e}")


async def cache_drop(key: str) -> None:
    if client is None:
        return
    try:
        await client.delete(key)
    except Exception as e:
        print(f"⚠️  Redis delete failed ({key}): {e}")
