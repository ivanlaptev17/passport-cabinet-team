import io
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from docxtpl import DocxTemplate

from app.api.security import get_current_user

router = APIRouter(prefix="/data/document-templates", tags=["document-templates"])

TEMPLATES_DIR = Path(__file__).resolve().parents[3] / "templates"

# Реестр шаблонов: соответствует плейсхолдерам {{ ... }} в .docx-файлах
# (см. app/templates/build_templates.py)
TEMPLATES = {
    "position-certificate": {
        "name": "Справка о занимаемой должности",
        "file": "position_certificate.docx",
        "fields": [
            {"key": "fio", "label": "ФИО сотрудника", "type": "text"},
            {"key": "position", "label": "Должность", "type": "text"},
            {"key": "organization_name", "label": "Организация", "type": "text"},
            {"key": "issue_date", "label": "Дата выдачи", "type": "text"},
            {"key": "director_name", "label": "ФИО директора", "type": "text"},
        ],
    },
    "responsible-order": {
        "name": "Приказ о назначении ответственных лиц",
        "file": "responsible_order.docx",
        "fields": [
            {"key": "order_number", "label": "Номер приказа", "type": "text"},
            {"key": "order_date", "label": "Дата приказа", "type": "text"},
            {"key": "organization_name", "label": "Организация", "type": "text"},
            {"key": "director_name", "label": "ФИО директора", "type": "text"},
            {
                "key": "responsible_persons",
                "label": "Ответственные лица",
                "type": "list",
                "item_fields": [
                    {"key": "fio", "label": "ФИО"},
                    {"key": "position", "label": "Должность"},
                    {"key": "area", "label": "Зона ответственности"},
                ],
            },
        ],
    },
}


@router.get("")
async def list_document_templates(current_user=Depends(get_current_user)):
    return [
        {"id": template_id, "name": t["name"], "fields": t["fields"]}
        for template_id, t in TEMPLATES.items()
    ]


class GenerateRequest(BaseModel):
    values: dict


@router.post("/{template_id}/generate")
async def generate_document(
    template_id: str,
    payload: GenerateRequest,
    current_user=Depends(get_current_user),
):
    tpl_meta = TEMPLATES.get(template_id)
    if not tpl_meta:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    tpl_path = TEMPLATES_DIR / tpl_meta["file"]
    if not tpl_path.exists():
        raise HTTPException(status_code=500, detail="Файл шаблона не найден на сервере")

    tpl = DocxTemplate(tpl_path)
    tpl.render(payload.values)

    buf = io.BytesIO()
    tpl.save(buf)
    buf.seek(0)

    filename = f"{tpl_meta['name']}.docx"
    return Response(
        content=buf.read(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
