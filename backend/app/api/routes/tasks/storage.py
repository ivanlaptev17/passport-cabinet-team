"""Файлы, прикреплённые к сообщениям чата.

Лежат на диске (как документы организации), в базе — только метаданные и путь.
"""

import asyncio
import shutil
import uuid
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps

TASK_FILES_DIR = Path("/app/task_files")
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 МБ
CHUNK_SIZE = 1024 * 1024

# Превью делаем только для растровых форматов, которые Pillow реально распознал.
# SVG и прочее, что браузер может исполнить, в предпросмотр не пускаем
PREVIEW_FORMATS = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "GIF": "image/gif",
    "WEBP": "image/webp",
}
THUMB_SIZE = (640, 640)


def task_dir(organization_id: int, task_id: int) -> Path:
    return TASK_FILES_DIR / str(organization_id) / str(task_id)


def _make_thumbnail(source: Path) -> tuple[Path, str] | None:
    """Уменьшенная копия картинки или None, если это не изображение.

    Тип определяем по содержимому, а не по заголовку от клиента: иначе HTML,
    загруженный с Content-Type: image/png, показался бы в браузере как страница.
    """
    try:
        with Image.open(source) as original:
            fmt = original.format
            if fmt not in PREVIEW_FORMATS:
                return None

            # фото с телефона хранят поворот в EXIF — без этого превью лежит на боку
            image = ImageOps.exif_transpose(original)
            image.thumbnail(THUMB_SIZE)

            # JPEG не умеет прозрачность — подкладываем белый фон
            if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
                rgba = image.convert("RGBA")
                background = Image.new("RGB", rgba.size, "white")
                background.paste(rgba, mask=rgba.split()[-1])
                image = background
            else:
                image = image.convert("RGB")

            thumb = source.with_name(f"{source.stem}_thumb.jpg")
            image.save(thumb, "JPEG", quality=82, optimize=True)
            return thumb, PREVIEW_FORMATS[fmt]
    except Exception:
        # битый файл, «бомба» из гигантского разрешения — просто без превью
        return None


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

    # Pillow синхронный и грузит процессор — уводим из event loop
    preview = await asyncio.to_thread(_make_thumbnail, path)
    thumb_path, detected_mime = preview if preview else (None, None)

    return {
        "file_path": str(path),
        "file_name": file.filename,
        "file_size": size,
        # для картинок — тип по содержимому, для остального — что прислал клиент
        "file_mime": detected_mime or file.content_type,
        "file_thumb_path": str(thumb_path) if thumb_path else None,
    }


def remove_file(path: str | Path | None) -> None:
    """Убрать файл, если запись о нём в базу так и не попала."""
    if not path:
        return
    try:
        Path(path).unlink(missing_ok=True)
    except OSError as e:
        print(f"⚠️  Не удалось удалить файл {path}: {e}")


def remove_upload(file_info: dict) -> None:
    remove_file(file_info.get("file_path"))
    remove_file(file_info.get("file_thumb_path"))


def remove_task_files(organization_id: int, task_id: int) -> None:
    """Удалить вложения задачи. Каскад в базе файлы с диска не уносит."""
    try:
        shutil.rmtree(task_dir(organization_id, task_id), ignore_errors=True)
    except OSError as e:
        print(f"⚠️  Не удалось удалить файлы задачи {task_id}: {e}")
