"""«Сегодня» — по времени пользователей, а не сервера.

Сервер живёт в UTC, а школы и ОМСУ — в Московской области: с полуночи до трёх ночи
по Москве даты расходятся, и отпуск, начавшийся сегодня, ещё не считался бы текущим.
"""

import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

APP_TIMEZONE = ZoneInfo(os.getenv("APP_TIMEZONE", "Europe/Moscow"))


def today() -> date:
    return datetime.now(APP_TIMEZONE).date()
