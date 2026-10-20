"""Выбранная организация: «в момент времени смотрим на одну организацию».

Фронт присылает её в заголовке X-Organization-Id, а там, где заголовок не передать
(EventSource), — параметром ?org=. Значение кладётся в контекст запроса, и все разделы
с данными школы фильтруются по нему через permissions.scoped_org_ids — без того,
чтобы прокидывать параметр в каждую ручку.

Само по себе значение ничего не разрешает: доступ всё равно проверяется по членству
в организации, просто из доступного остаётся одна выбранная.
"""

from contextvars import ContextVar
from urllib.parse import parse_qs

active_org_id: ContextVar[int | None] = ContextVar("active_org_id", default=None)

HEADER = b"x-organization-id"


def _parse(value: bytes | str | None) -> int | None:
    if not value:
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    # id в базе — bigint: большее число дало бы 500 вместо «не выбрано»
    return number if 0 < number <= 2**63 - 1 else None


class ActiveOrgMiddleware:
    """Чистый ASGI, а не BaseHTTPMiddleware: значение ставится в том же контексте,
    где выполняется ручка, в том числе для долгих SSE-ответов."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        value = dict(scope.get("headers") or []).get(HEADER)
        org_id = _parse(value)
        if org_id is None:
            query = parse_qs((scope.get("query_string") or b"").decode())
            org_id = _parse((query.get("org") or [None])[0])

        token = active_org_id.set(org_id)
        try:
            await self.app(scope, receive, send)
        finally:
            active_org_id.reset(token)
