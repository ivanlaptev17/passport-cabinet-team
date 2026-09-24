"""Web Push: системные уведомления на компьютер и телефон — даже при закрытой вкладке.

Как это работает. Браузер, получив разрешение пользователя, выдаёт «подписку»:
адрес push-сервиса своего производителя (Google, Mozilla, Apple, Microsoft) и ключи
шифрования. Мы храним подписку и, когда случается событие, шлём на этот адрес
зашифрованное сообщение, подписанное нашим VAPID-ключом. Push-сервис доставляет его
в браузер, а service worker (frontend/public/sw.js) показывает системное уведомление.

VAPID-ключ генерируется при первом запуске и сохраняется в файл: если он сменится,
все выданные подписки станут недействительными. На проде ключ лучше передать через env.
"""

import asyncio
import base64
import ipaddress
import json
import os
import socket
from pathlib import Path
from urllib.parse import urlparse

import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from requests.adapters import HTTPAdapter
from urllib3.connection import HTTPSConnection
from urllib3.connectionpool import HTTPSConnectionPool

from app.api.database import db as _db
from app.api.database.db import get_connection
from app.api.security import get_current_user

try:
    from py_vapid import Vapid
    from pywebpush import WebPushException, webpush
    PUSH_AVAILABLE = True
except ImportError:  # зависимость не установлена — работаем без push, остальное живо
    PUSH_AVAILABLE = False

KEYS_FILE = Path(os.getenv("VAPID_KEYS_FILE", "/app/.vapid.json"))
SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@passport-cabinet.local")
TTL_SECONDS = 24 * 60 * 60

# Хосты, которым в тестах можно не проходить проверку на внутренние адреса
_TEST_HOSTS = {h.strip() for h in os.getenv("PUSH_TEST_HOSTS", "").split(",") if h.strip()}

router = APIRouter(prefix="/push", tags=["push"])

_vapid = None
_public_key: str | None = None
_background: set[asyncio.Task] = set()


# ── Ключи ─────────────────────────────────────────────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _keys():
    """VAPID-ключ: из env, из файла или новый. Возвращает (Vapid, публичный ключ)."""
    global _vapid, _public_key
    if _vapid is not None:
        return _vapid, _public_key

    pem = os.getenv("VAPID_PRIVATE_KEY_PEM")
    if not pem and KEYS_FILE.exists():
        pem = json.loads(KEYS_FILE.read_text())["private_pem"]
    if not pem:
        key = ec.generate_private_key(ec.SECP256R1())
        pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
        KEYS_FILE.write_text(json.dumps({"private_pem": pem}))
        os.chmod(KEYS_FILE, 0o600)
        print(f"🔑 Сгенерирован VAPID-ключ: {KEYS_FILE}")

    _vapid = Vapid.from_pem(pem.encode())
    raw = _vapid.public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    _public_key = _b64url(raw)
    return _vapid, _public_key


# ── Проверка адреса подписки ──────────────────────────────────────────────────

def _is_public_ip(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    # ::ffff:127.0.0.1 — тот же localhost, только в записи IPv6
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local
        or ip.is_reserved or ip.is_multicast or ip.is_unspecified
    )


def _is_public_endpoint(endpoint: str) -> bool:
    """Адрес подписки присылает браузер, а POST на него потом делает наш сервер.

    Без проверки можно было бы «подписаться» адресом вроде http://db:5432 и заставить
    бэкенд стучаться во внутреннюю сеть. Пускаем только https на публичные адреса.
    """
    parsed = urlparse(endpoint)
    host = parsed.hostname
    if not host:
        return False
    if host in _TEST_HOSTS:
        return True
    if parsed.scheme != "https":
        return False
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, parsed.port or 443)}
    except socket.gaierror:
        return False
    return all(_is_public_ip(address) for address in addresses)


# Проверка при подписке нужна, чтобы сразу отказать, но защитой она не является:
# requests при отправке заново спрашивает DNS и ходит по редиректам. Хватило бы
# DNS, который при проверке отвечает публичным адресом, а при отправке — внутренним,
# или простого 302 на http://db:5432. Поэтому адрес проверяется у уже открытого
# соединения, а редиректы запрещены.

class _PublicOnlyHTTPSConnection(HTTPSConnection):
    def connect(self):
        super().connect()
        peer = self.sock.getpeername()[0]
        if not _is_public_ip(peer):
            self.sock.close()
            raise ConnectionError(f"push-адрес указывает во внутреннюю сеть: {peer}")


class _PublicOnlyHTTPSPool(HTTPSConnectionPool):
    ConnectionCls = _PublicOnlyHTTPSConnection


class _PublicOnlyAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        super().init_poolmanager(*args, **kwargs)
        self.poolmanager.pool_classes_by_scheme = {"https": _PublicOnlyHTTPSPool}


class _RefuseAdapter(HTTPAdapter):
    def send(self, request, *args, **kwargs):
        raise requests.exceptions.InvalidSchema("push-адрес должен быть https")


def _push_session() -> requests.Session:
    """Сессия для отправки: только https, только публичные адреса, без редиректов и прокси."""
    session = requests.Session()
    session.max_redirects = 0
    session.trust_env = False
    session.mount("https://", _PublicOnlyAdapter())
    session.mount("http://", _RefuseAdapter())
    return session


# ── Ручки ─────────────────────────────────────────────────────────────────────

class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class Subscription(BaseModel):
    endpoint: str
    keys: SubscriptionKeys


class Unsubscribe(BaseModel):
    endpoint: str


@router.get("/public-key")
async def get_public_key(_current_user=Depends(get_current_user)):
    if not PUSH_AVAILABLE:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Push не настроен")
    _, public_key = _keys()
    return {"public_key": public_key}


@router.post("/subscribe")
async def subscribe(
    payload: Subscription,
    request: Request,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    if not await asyncio.to_thread(_is_public_endpoint, payload.endpoint):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Недопустимый адрес подписки",
        )

    # Тот же браузер мог раньше принадлежать другому пользователю (разлогинились
    # и зашли под другим) — подписка переходит к текущему
    await conn.execute(
        """
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (endpoint) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            user_agent = EXCLUDED.user_agent
        """,
        current_user["id"],
        payload.endpoint,
        payload.keys.p256dh,
        payload.keys.auth,
        (request.headers.get("user-agent") or "")[:300],
    )
    return {"ok": True}


@router.post("/unsubscribe")
async def unsubscribe(
    payload: Unsubscribe,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    await conn.execute(
        "DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2",
        payload.endpoint, current_user["id"],
    )
    return {"ok": True}


# ── Текст уведомления ─────────────────────────────────────────────────────────

_STATUS_LABELS = {
    "NEW": "Новая",
    "IN_PROGRESS": "В работе",
    "PENDING_REVIEW": "Ожидает проверки",
    "DONE": "Завершена",
}


def _payload(value) -> dict:
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value) if value else {}
    except (TypeError, ValueError):
        return {}


def build_message(notification: dict, messages: dict[int, dict]) -> dict:
    """Что показать в системном уведомлении.

    В колокольчике текст собирает фронт, а здесь его показывает service worker,
    у которого нет доступа к коду приложения, — поэтому собираем на сервере.
    """
    kind = notification["notification_type"]
    data = _payload(notification.get("payload"))
    actor = " ".join(filter(None, [notification.get("actor_last_name"), notification.get("actor_first_name")]))

    if kind == "NEW_MESSAGE":
        message = messages.get(notification.get("message_id") or 0, {})
        text = (message.get("body") or "").strip()
        if not text and message.get("file_name"):
            text = f"📎 {message['file_name']}"
        body = f"{actor}: {text}" if actor else text
        body = body[:160] or "Новое сообщение"
        tag = f"task-{notification['task_id']}-messages"
    elif kind == "PARTICIPANT_ADDED":
        body, tag = "Вас добавили в задачу", f"task-{notification['task_id']}-participant"
    elif kind == "PARTICIPANT_REMOVED":
        body, tag = "Вас убрали из задачи", f"task-{notification['task_id']}-participant"
    elif kind == "TASK_PENDING_REVIEW":
        body, tag = "Задача ждёт вашей проверки", f"task-{notification['task_id']}-status"
    elif kind == "STATUS_CHANGED":
        before = _STATUS_LABELS.get(data.get("from"), data.get("from") or "")
        after = _STATUS_LABELS.get(data.get("to"), data.get("to") or "")
        body, tag = f"Статус: {before} → {after}", f"task-{notification['task_id']}-status"
    else:
        body, tag = "Новое событие по задаче", f"task-{notification['task_id']}"

    return {
        "title": notification.get("task_title") or "Задача",
        "body": body,
        "url": f"/tasks/{notification['task_id']}",
        "tag": tag,
    }


# ── Отправка ──────────────────────────────────────────────────────────────────

def _send_sync(subscription: dict, data: dict) -> str:
    """Одна отправка. Возвращает ok / gone (подписка мертва) / error."""
    vapid, _ = _keys()
    host = urlparse(subscription["endpoint"]).hostname
    # тестовые хосты (имитация push-сервиса) живут на localhost — им защита мешала бы
    session = None if host in _TEST_HOSTS else _push_session()
    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
            },
            data=json.dumps(data, ensure_ascii=False),
            vapid_private_key=vapid,
            # Свежий словарь на каждый вызов: pywebpush дописывает в него aud под
            # конкретный push-сервис, и общий словарь «запомнил» бы чужой адрес
            vapid_claims={"sub": SUBJECT},
            ttl=TTL_SECONDS,
            timeout=10,
            requests_session=session,
        )
        return "ok"
    except WebPushException as e:
        code = e.response.status_code if e.response is not None else None
        # 404/410 — пользователь отозвал разрешение или браузер сменил подписку
        if code in (404, 410):
            return "gone"
        print(f"⚠️  Push не доставлен ({code}): {e}")
        return "error"
    except Exception as e:
        print(f"⚠️  Push не доставлен: {e}")
        return "error"
    finally:
        if session is not None:
            session.close()


async def deliver(notifications: list[dict], messages: dict[int, dict]) -> dict:
    """Разослать уведомления на все устройства получателей. Возвращает счётчики."""
    stats = {"ok": 0, "gone": 0, "error": 0, "skipped": 0}
    if not PUSH_AVAILABLE or not notifications:
        return stats

    user_ids = sorted({n["recipient_user_id"] for n in notifications})
    async with _db.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::bigint[])",
            user_ids,
        )
    by_user: dict[int, list[dict]] = {}
    for row in rows:
        by_user.setdefault(row["user_id"], []).append(dict(row))

    jobs, targets = [], []
    for notification in notifications:
        data = build_message(notification, messages)
        for subscription in by_user.get(notification["recipient_user_id"], []):
            # адрес мог смениться после подписки (DNS) — проверяем перед каждой отправкой
            if not await asyncio.to_thread(_is_public_endpoint, subscription["endpoint"]):
                stats["skipped"] += 1
                continue
            jobs.append(asyncio.to_thread(_send_sync, subscription, data))
            targets.append(subscription["id"])

    results = await asyncio.gather(*jobs)
    delivered = [sid for sid, r in zip(targets, results) if r == "ok"]
    gone = [sid for sid, r in zip(targets, results) if r == "gone"]
    for r in results:
        stats[r] += 1

    if delivered or gone:
        async with _db.pool.acquire() as conn:
            if delivered:
                await conn.execute(
                    "UPDATE push_subscriptions SET last_success_at = NOW() WHERE id = ANY($1::bigint[])",
                    delivered,
                )
            if gone:
                await conn.execute(
                    "DELETE FROM push_subscriptions WHERE id = ANY($1::bigint[])",
                    gone,
                )
    return stats


async def _deliver_safely(notifications: list[dict], messages: dict[int, dict]) -> None:
    try:
        await deliver(notifications, messages)
    except Exception as e:
        print(f"⚠️  Ошибка рассылки push: {e}")


def schedule_notifications(notifications: list[dict], messages: dict[int, dict]) -> None:
    """Отправить в фоне, не задерживая ответ пользователю.

    Ссылку на задачу держим в множестве: asyncio хранит на фоновые задачи только
    слабые ссылки, и без этого сборщик мусора мог бы прибить отправку на полпути.
    """
    if not PUSH_AVAILABLE or not notifications:
        return
    task = asyncio.get_running_loop().create_task(_deliver_safely(notifications, messages))
    _background.add(task)
    task.add_done_callback(_background.discard)
