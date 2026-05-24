import uuid
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.api.database.db import get_connection
from app.api.security import get_current_user
from app.api.permissions import (
    get_user_org_ids,
    is_org_scoped_user,
    require_org_write_access,
)

router = APIRouter(prefix="/data", tags=["documents"])

UPLOAD_DIR = Path("/app/documents")
VALID_STATUSES = {"PENDING", "APPROVED", "OVERDUE"}


class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


async def _log(conn, document_id: int, user_id: int, action: str, details: str = None):
    await conn.execute(
        """
        INSERT INTO document_logs (document_id, user_id, action, details)
        VALUES ($1, $2, $3, $4)
        """,
        document_id, user_id, action, details,
    )


@router.get("/documents")
async def list_documents(
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    org_ids = await get_user_org_ids(current_user["id"], conn) if is_org_scoped_user(current_user) else None

    rows = await conn.fetch(
        """
        SELECT
            d.id,
            d.organization_id,
            o.name AS organization,
            d.name,
            d.description,
            d.status,
            d.original_filename,
            d.file_size,
            d.uploaded_at,
            d.updated_at,
            u.last_name  AS uploader_last_name,
            u.first_name AS uploader_first_name,
            u.email      AS uploader_email
        FROM documents d
        JOIN organizations o ON o.id = d.organization_id
        LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE ($1::bigint[] IS NULL OR d.organization_id = ANY($1))
        ORDER BY d.uploaded_at DESC
        """,
        org_ids,
    )
    return [dict(r) for r in rows]


@router.post("/documents", status_code=201)
async def upload_document(
    organization_id: int = Form(...),
    name: str = Form(...),
    description: str = Form(""),
    status: str = Form("PENDING"),
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid status")

    await require_org_write_access(
        current_user, organization_id, conn,
        allowed_org_roles=("DIRECTOR", "STAFF"),
    )

    org_dir = UPLOAD_DIR / str(organization_id)
    org_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "file").suffix
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = org_dir / stored_name

    contents = await file.read()
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(contents)

    row = await conn.fetchrow(
        """
        INSERT INTO documents
            (organization_id, name, description, status, file_path, original_filename, file_size, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, organization_id, name, description, status, original_filename, file_size, uploaded_at, updated_at
        """,
        organization_id,
        name,
        description or None,
        status,
        str(file_path),
        file.filename,
        len(contents),
        current_user["id"],
    )

    await _log(conn, row["id"], current_user["id"], "UPLOAD", file.filename)

    org_row = await conn.fetchrow("SELECT name FROM organizations WHERE id = $1", organization_id)
    uploader = await conn.fetchrow(
        "SELECT last_name, first_name, email FROM users WHERE id = $1", current_user["id"]
    )

    return {
        **dict(row),
        "organization": org_row["name"] if org_row else "",
        "uploader_last_name": uploader["last_name"] if uploader else None,
        "uploader_first_name": uploader["first_name"] if uploader else None,
        "uploader_email": uploader["email"] if uploader else None,
    }


@router.put("/documents/{doc_id}")
async def update_document(
    doc_id: int,
    payload: DocumentUpdate,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow("SELECT id, organization_id FROM documents WHERE id = $1", doc_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found")

    await require_org_write_access(
        current_user, existing["organization_id"], conn,
        allowed_org_roles=("DIRECTOR", "STAFF"),
    )

    if payload.status and payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid status")

    fields = {k: v for k, v in payload.model_dump().items() if v is not None}
    if fields:
        fields["updated_at"] = "NOW()"
        set_parts = []
        values = [doc_id]
        idx = 2
        for key, val in fields.items():
            if key == "updated_at":
                set_parts.append(f"{key} = NOW()")
            else:
                set_parts.append(f"{key} = ${idx}")
                values.append(val)
                idx += 1
        await conn.execute(
            f"UPDATE documents SET {', '.join(set_parts)} WHERE id = $1",
            *values,
        )
        await _log(conn, doc_id, current_user["id"], "UPDATE", None)

    rows = await conn.fetch(
        """
        SELECT d.id, d.organization_id, o.name AS organization,
               d.name, d.description, d.status,
               d.original_filename, d.file_size, d.uploaded_at, d.updated_at,
               u.last_name AS uploader_last_name, u.first_name AS uploader_first_name, u.email AS uploader_email
        FROM documents d
        JOIN organizations o ON o.id = d.organization_id
        LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.id = $1
        """,
        doc_id,
    )
    return dict(rows[0])


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    existing = await conn.fetchrow(
        "SELECT id, organization_id, file_path FROM documents WHERE id = $1", doc_id
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found")

    await require_org_write_access(
        current_user, existing["organization_id"], conn,
        allowed_org_roles=("DIRECTOR",),
    )

    await _log(conn, doc_id, current_user["id"], "DELETE", None)
    await conn.execute("DELETE FROM documents WHERE id = $1", doc_id)

    try:
        Path(existing["file_path"]).unlink(missing_ok=True)
    except Exception:
        pass

    return {"ok": True}


@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_connection),
):
    row = await conn.fetchrow(
        "SELECT id, organization_id, file_path, original_filename FROM documents WHERE id = $1",
        doc_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")

    # org-scoped users can only access their org's docs
    if is_org_scoped_user(current_user):
        org_ids = await get_user_org_ids(current_user["id"], conn)
        if row["organization_id"] not in org_ids:
            raise HTTPException(status_code=403, detail="Access denied")

    file_path = Path(row["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    await _log(conn, doc_id, current_user["id"], "DOWNLOAD", None)

    return FileResponse(
        path=str(file_path),
        filename=row["original_filename"],
        media_type="application/octet-stream",
    )
