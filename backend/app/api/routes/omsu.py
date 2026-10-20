"""ОМСУ — перечень представителей органов местного самоуправления.

Обмен устроен так: у каждого региона одна учётная запись ОМСУ. Она заполняет своих
представителей по фиксированному набору должностей (как в таблице министерства),
их отпуска — датами — и тех, кто их замещает. Министерство видит сводку по всем
регионам: кто сейчас в отпуске и кем замещён, у кого отпуск скоро, когда регион
последний раз обновлял данные. Отпуска именно датами, а не текстом: иначе «кто
в отпуске сегодня» не посчитать.

Читают: министерство и администратор системы — все регионы, ОМСУ — свой.
Пишут: ОМСУ — свой регион, администратор системы — любой.
"""

from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.database.db import get_connection
from app.api.permissions import has_global_full_access, has_global_view_access
from app.api.security import get_current_user
from app.api.utils.clock import today as local_today

router = APIRouter(prefix="/omsu", tags=["omsu"])

OMSU_ROLE = "OMSU"

# Порядок — как в таблице министерства. Начальник управления — главный контакт
POSITIONS = [
    {"code": "HEAD", "label": "Глава"},
    {"code": "DEPUTY_HEAD", "label": "Заместитель главы по социальным вопросам"},
    {"code": "EDU_HEAD", "label": "Начальник управления образования", "primary": True},
    {"code": "EDU_DEPUTY", "label": "Заместитель начальника управления"},
    {"code": "EDU_STAFF", "label": "Сотрудник управления"},
]
POSITION_CODES = {p["code"] for p in POSITIONS}

UPCOMING_DAYS = 30
MAX_SHORT = 200
MAX_TEXT = 1000
MAX_VACATIONS = 50


class VacationIn(BaseModel):
    starts_on: date
    ends_on: date


class RepresentativeIn(BaseModel):
    position_code: str
    full_name: str
    position_title: Optional[str] = None
    contacts: Optional[str] = None
    email: Optional[str] = None
    deputy: Optional[str] = None
    vacations: List[VacationIn] = []


class MunicipalityUpdate(BaseModel):
    education_body: Optional[str] = None


# ── Доступ ────────────────────────────────────────────────────────────────────

async def _own_municipality(conn, current_user: dict) -> int | None:
    if current_user.get("role_code") != OMSU_ROLE:
        return None
    return await conn.fetchval(
        "SELECT municipality_id FROM omsu_accounts WHERE user_id = $1",
        current_user["id"],
    )


async def _can_read(conn, current_user: dict, municipality_id: int) -> bool:
    if has_global_view_access(current_user):
        return True
    return await _own_municipality(conn, current_user) == municipality_id


async def _can_write(conn, current_user: dict, municipality_id: int) -> bool:
    if has_global_full_access(current_user):
        return True
    return await _own_municipality(conn, current_user) == municipality_id


async def _require(conn, current_user: dict, municipality_id: int, *, write: bool) -> None:
    exists = await conn.fetchval("SELECT 1 FROM municipalities WHERE id = $1", municipality_id)
    if not exists or not await _can_read(conn, current_user, municipality_id):
        # Чужой регион и несуществующий неотличимы
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Регион не найден")
    if write and not await _can_write(conn, current_user, municipality_id):
        # Видеть может (министерство), а менять — только сам ОМСУ
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Данные заполняет ОМСУ региона")


# ── Вспомогательное ───────────────────────────────────────────────────────────

def _clean(value: Optional[str], limit: int) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if len(value) > limit:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Поле длиннее {limit} символов")
    return value or None


def _validate(payload: RepresentativeIn) -> dict:
    if payload.position_code not in POSITION_CODES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неизвестная должность")
    full_name = _clean(payload.full_name, MAX_SHORT)
    if not full_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Укажите ФИО")
    if len(payload.vacations) > MAX_VACATIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Слишком много отпусков")
    for v in payload.vacations:
        if v.ends_on < v.starts_on:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Отпуск заканчивается раньше, чем начинается")
    return {
        "position_code": payload.position_code,
        "full_name": full_name,
        "position_title": _clean(payload.position_title, MAX_SHORT),
        "contacts": _clean(payload.contacts, MAX_TEXT),
        "email": _clean(payload.email, MAX_SHORT),
        "deputy": _clean(payload.deputy, MAX_SHORT),
    }


async def _touch(conn, municipality_id: int, user_id: int) -> None:
    """Дата последнего обновления региона — министерству видно, насколько данные свежие."""
    await conn.execute(
        "UPDATE municipalities SET updated_at = NOW(), updated_by_user_id = $2 WHERE id = $1",
        municipality_id, user_id,
    )


async def _save_vacations(conn, representative_id: int, vacations: List[VacationIn]) -> None:
    await conn.execute("DELETE FROM omsu_vacations WHERE representative_id = $1", representative_id)
    if vacations:
        await conn.executemany(
            "INSERT INTO omsu_vacations (representative_id, starts_on, ends_on) VALUES ($1, $2, $3)",
            [(representative_id, v.starts_on, v.ends_on) for v in sorted(vacations, key=lambda v: v.starts_on)],
        )


async def _representatives(conn, municipality_ids: list[int]) -> dict[int, list[dict]]:
    """Представители с отпусками, сгруппированные по региону."""
    reps = await conn.fetch(
        """
        SELECT id, municipality_id, position_code, full_name, position_title,
               contacts, email, deputy, sort_order, updated_at
        FROM omsu_representatives
        WHERE municipality_id = ANY($1::bigint[])
        ORDER BY municipality_id, sort_order, id
        """,
        municipality_ids,
    )
    vacations = await conn.fetch(
        """
        SELECT v.id, v.representative_id, v.starts_on, v.ends_on
        FROM omsu_vacations v
        JOIN omsu_representatives r ON r.id = v.representative_id
        WHERE r.municipality_id = ANY($1::bigint[])
        ORDER BY v.starts_on
        """,
        municipality_ids,
    )
    by_rep: dict[int, list[dict]] = {}
    for v in vacations:
        by_rep.setdefault(v["representative_id"], []).append(
            {"id": v["id"], "starts_on": v["starts_on"], "ends_on": v["ends_on"]}
        )

    result: dict[int, list[dict]] = {}
    today = local_today()
    for r in reps:
        rep = dict(r)
        rep["vacations"] = by_rep.get(r["id"], [])
        current = next((v for v in rep["vacations"] if v["starts_on"] <= today <= v["ends_on"]), None)
        upcoming = next(
            (v for v in rep["vacations"] if today < v["starts_on"] <= today + timedelta(days=UPCOMING_DAYS)),
            None,
        )
        rep["on_vacation"] = current
        rep["upcoming_vacation"] = upcoming
        result.setdefault(r["municipality_id"], []).append(rep)
    return result


async def _representative_out(conn, rep_id: int) -> dict:
    municipality_id = await conn.fetchval("SELECT municipality_id FROM omsu_representatives WHERE id = $1", rep_id)
    reps = (await _representatives(conn, [municipality_id])).get(municipality_id, [])
    return next(r for r in reps if r["id"] == rep_id)


# ── Ручки ─────────────────────────────────────────────────────────────────────

@router.get("/positions")
async def list_positions(_current_user=Depends(get_current_user)):
    return POSITIONS


@router.get("/municipalities")
async def list_municipalities(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    """Сводка для министерства: по каждому региону — главный контакт, кто в отпуске
    сейчас и кто скоро уходит, насколько свежие данные. ОМСУ видит только свой регион."""
    if has_global_view_access(current_user):
        rows = await conn.fetch("SELECT id, name, education_body, updated_at FROM municipalities ORDER BY name")
    else:
        own = await _own_municipality(conn, current_user)
        if own is None:
            return []
        rows = await conn.fetch(
            "SELECT id, name, education_body, updated_at FROM municipalities WHERE id = $1", own,
        )

    reps_by_mun = await _representatives(conn, [r["id"] for r in rows])
    result = []
    for row in rows:
        reps = reps_by_mun.get(row["id"], [])
        filled = {r["position_code"] for r in reps}
        result.append({
            **dict(row),
            "representatives_count": len(reps),
            "positions_filled": len(filled),
            "positions_total": len(POSITIONS),
            "missing_positions": [p["label"] for p in POSITIONS if p["code"] not in filled],
            "primary_contact": next(
                ({"full_name": r["full_name"], "contacts": r["contacts"], "email": r["email"]}
                 for r in reps if r["position_code"] == "EDU_HEAD"),
                None,
            ),
            "on_vacation": [
                {"full_name": r["full_name"], "position_code": r["position_code"],
                 "ends_on": r["on_vacation"]["ends_on"], "deputy": r["deputy"]}
                for r in reps if r["on_vacation"]
            ],
            "upcoming_vacations": [
                {"full_name": r["full_name"], "position_code": r["position_code"],
                 "starts_on": r["upcoming_vacation"]["starts_on"], "ends_on": r["upcoming_vacation"]["ends_on"]}
                for r in reps if r["upcoming_vacation"]
            ],
        })
    return result


@router.get("/municipalities/{municipality_id:int}")
async def get_municipality(
    municipality_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    await _require(conn, current_user, municipality_id, write=False)
    row = await conn.fetchrow(
        """
        SELECT m.id, m.name, m.education_body, m.updated_at,
               u.last_name AS updated_by_last_name, u.first_name AS updated_by_first_name
        FROM municipalities m
        LEFT JOIN users u ON u.id = m.updated_by_user_id
        WHERE m.id = $1
        """,
        municipality_id,
    )
    reps = (await _representatives(conn, [municipality_id])).get(municipality_id, [])
    return {
        **dict(row),
        "can_edit": await _can_write(conn, current_user, municipality_id),
        "positions": POSITIONS,
        "representatives": reps,
    }


@router.put("/municipalities/{municipality_id:int}")
async def update_municipality(
    municipality_id: int,
    payload: MunicipalityUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    await _require(conn, current_user, municipality_id, write=True)
    if payload.education_body is not None:
        await conn.execute(
            "UPDATE municipalities SET education_body = $2 WHERE id = $1",
            municipality_id, _clean(payload.education_body, MAX_SHORT),
        )
        await _touch(conn, municipality_id, current_user["id"])
    return {"ok": True}


@router.post("/municipalities/{municipality_id:int}/representatives", status_code=status.HTTP_201_CREATED)
async def create_representative(
    municipality_id: int,
    payload: RepresentativeIn,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    await _require(conn, current_user, municipality_id, write=True)
    fields = _validate(payload)
    async with conn.transaction():
        rep_id = await conn.fetchval(
            """
            INSERT INTO omsu_representatives
                (municipality_id, position_code, full_name, position_title, contacts, email, deputy,
                 sort_order, updated_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7,
                    (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM omsu_representatives
                     WHERE municipality_id = $1 AND position_code = $2),
                    $8)
            RETURNING id
            """,
            municipality_id, fields["position_code"], fields["full_name"], fields["position_title"],
            fields["contacts"], fields["email"], fields["deputy"], current_user["id"],
        )
        await _save_vacations(conn, rep_id, payload.vacations)
        await _touch(conn, municipality_id, current_user["id"])
    return await _representative_out(conn, rep_id)


@router.put("/representatives/{rep_id:int}")
async def update_representative(
    rep_id: int,
    payload: RepresentativeIn,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    municipality_id = await conn.fetchval("SELECT municipality_id FROM omsu_representatives WHERE id = $1", rep_id)
    if municipality_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Представитель не найден")
    await _require(conn, current_user, municipality_id, write=True)
    fields = _validate(payload)
    async with conn.transaction():
        await conn.execute(
            """
            UPDATE omsu_representatives
            SET position_code = $2, full_name = $3, position_title = $4, contacts = $5,
                email = $6, deputy = $7, updated_at = NOW(), updated_by_user_id = $8
            WHERE id = $1
            """,
            rep_id, fields["position_code"], fields["full_name"], fields["position_title"],
            fields["contacts"], fields["email"], fields["deputy"], current_user["id"],
        )
        await _save_vacations(conn, rep_id, payload.vacations)
        await _touch(conn, municipality_id, current_user["id"])
    return await _representative_out(conn, rep_id)


@router.delete("/representatives/{rep_id:int}")
async def delete_representative(
    rep_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    municipality_id = await conn.fetchval("SELECT municipality_id FROM omsu_representatives WHERE id = $1", rep_id)
    if municipality_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Представитель не найден")
    await _require(conn, current_user, municipality_id, write=True)
    async with conn.transaction():
        await conn.execute("DELETE FROM omsu_representatives WHERE id = $1", rep_id)
        await _touch(conn, municipality_id, current_user["id"])
    return {"ok": True}
