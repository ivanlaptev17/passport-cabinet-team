from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.database.db import get_connection
from app.api.security import get_current_user
from app.api.utils.xlsx_builder import XlsxBuilder
from app.api.routes.data.data import _org_ids_filter

router = APIRouter(prefix="/data/export", tags=["export"])

SEVERITY_RU = {"HIGH": "Высокий", "MEDIUM": "Средний", "LOW": "Низкий"}
STATUS_INC_RU = {"OPEN": "Открыт", "IN_PROGRESS": "В работе", "RESOLVED": "Решён"}


def _xlsx_response(buf, filename: str) -> Response:
    return Response(
        content=buf.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.get("/employees")
async def export_employees(
    category: str | None = None,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT
            e.last_name, e.first_name, e.middle_name,
            p.name AS position, c.name AS category,
            e.phone, o.name AS organization
        FROM employees e
        JOIN organizations o ON o.id = e.organization_id
        LEFT JOIN employee_positions ep ON ep.employee_id = e.id
        LEFT JOIN positions p ON p.id = ep.position_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ($1::TEXT IS NULL OR c.code = $1)
          AND ($2::bigint[] IS NULL OR e.organization_id = ANY($2))
        ORDER BY e.last_name, e.first_name
        """,
        category, allowed,
    )

    data = [
        [
            r["last_name"] or "",
            r["first_name"] or "",
            r["middle_name"] or "",
            r["position"] or "",
            r["category"] or "",
            r["phone"] or "",
            r["organization"] or "",
        ]
        for r in rows
    ]

    buf = await (
        XlsxBuilder("Сотрудники")
        .add_sheet(
            headers=["Фамилия", "Имя", "Отчество", "Должность", "Категория", "Телефон", "Организация"],
            rows=data,
        )
        .build()
    )
    return _xlsx_response(buf, "Сотрудники.xlsx")


@router.get("/organizations")
async def export_organizations(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT o.id, o.name, o.director_name, o.governance_body, o.founder
        FROM organizations o
        WHERE ($1::bigint[] IS NULL OR o.id = ANY($1))
        ORDER BY o.id
        """,
        allowed,
    )

    data = [
        [
            r["id"],
            r["name"] or "",
            r["director_name"] or "",
            r["governance_body"] or "",
            r["founder"] or "",
        ]
        for r in rows
    ]

    buf = await (
        XlsxBuilder("Организации")
        .add_sheet(
            headers=["ID", "Название", "Директор", "Орган управления", "Учредитель"],
            rows=data,
        )
        .build()
    )
    return _xlsx_response(buf, "Организации.xlsx")


@router.get("/incidents")
async def export_incidents(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    allowed = await _org_ids_filter(current_user, conn)
    rows = await conn.fetch(
        """
        SELECT i.id, o.name AS organization, i.title, i.description,
               i.status, i.severity, i.incident_date, i.created_at
        FROM incidents i
        JOIN organizations o ON o.id = i.organization_id
        WHERE ($1::bigint[] IS NULL OR i.organization_id = ANY($1))
        ORDER BY i.incident_date DESC, i.id DESC
        """,
        allowed,
    )

    data = [
        [
            r["id"],
            r["organization"] or "",
            r["title"] or "",
            r["description"] or "",
            STATUS_INC_RU.get(r["status"], r["status"]),
            SEVERITY_RU.get(r["severity"], r["severity"]),
            r["incident_date"].strftime("%d.%m.%Y") if r["incident_date"] else "",
            r["created_at"].strftime("%d.%m.%Y") if r["created_at"] else "",
        ]
        for r in rows
    ]

    buf = await (
        XlsxBuilder("Инциденты")
        .add_sheet(
            headers=["ID", "Организация", "Название", "Описание", "Статус", "Серьёзность", "Дата инцидента", "Создан"],
            rows=data,
        )
        .build()
    )
    return _xlsx_response(buf, "Инциденты.xlsx")
