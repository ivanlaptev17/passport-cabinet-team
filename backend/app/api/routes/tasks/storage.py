"""Файлы, прикреплённые к сообщениям чата.

Лежат на диске (как документы организации), в базе — только метаданные и путь.
"""

import shutil
import uuid
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile, status

TASK_FILES_DIR = Path("/app/task_files")
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 МБ
CHUNK_SIZE = 1024 * 1024


def task_dir(organization_id: int, task_id: int) -> Path:
    return TASK_FILES_DIR / str(organization_id) / str(task_id)


async def save_upload(file: UploadFile, organization_id: int, task_id: int) -> dict:
    """Сохраняет вложение и возвращает метаданные для записи в сообщение.

    Читаем кусками и обрываем, как только превышен лимит: иначе многогигабайтный
    запрос успел бы целиком приехать в память до проверки размера.
    Имя файла на диске — uuid, оригинальное имя хранится только в базе,
    так что подсунуть путь через filename нельзя.
    """
    directory = task_dir(organization_id, task_id)
    directory.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename or "file").suffix[:20]
    path = directory / f"{uuid.uuid4().hex}{suffix}"

    size = 0
    try:
        async with aiofiles.open(path, "wb") as out:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Файл больше {MAX_FILE_SIZE // (1024 * 1024)} МБ",
                    )
                await out.write(chunk)

        if size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пустой файл",
            )
    except Exception:
        path.unlink(missing_ok=True)
        raise

    return {
        "file_path": str(path),
        "file_name": file.filename,
        "file_size": size,
        "file_mime": file.content_type,
    }


def remove_file(path: str | Path | None) -> None:
    """Убрать файл, если запись о нём в базу так и не попала."""
    if not path:
        return
    try:
        Path(path).unlink(missing_ok=True)
    except OSError as e:
        print(f"⚠️  Не удалось удалить файл {path}: {e}")


def remove_task_files(organization_id: int, task_id: int) -> None:
    """Удалить вложения задачи. Каскад в базе файлы с диска не уносит."""
    try:
        shutil.rmtree(task_dir(organization_id, task_id), ignore_errors=True)
    except OSError as e:
        print(f"⚠️  Не удалось удалить файлы задачи {task_id}: {e}")
