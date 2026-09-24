from fastapi import APIRouter
from app.api.routes.auth import auth
from app.api.routes.data import data
from app.api.routes.data import documents
from app.api.routes.data import document_templates
from app.api.routes.data import xlsx_export
from app.api import push
from app.api.routes.org import admin as org_admin
from app.api.routes.tasks import categories as task_categories
from app.api.routes.tasks import chat as task_chat
from app.api.routes.tasks import notifications as task_notifications
from app.api.routes.tasks import tasks

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(data.router)
api_router.include_router(documents.router)
api_router.include_router(document_templates.router)
api_router.include_router(xlsx_export.router)

# Порядок важен: /tasks/notifications/stream должен матчиться раньше,
# чем /tasks/{task_id}/stream, иначе путь уедет в чат задачи
api_router.include_router(task_notifications.router)
api_router.include_router(task_categories.router)
api_router.include_router(task_chat.router)
api_router.include_router(tasks.router)

api_router.include_router(push.router)
api_router.include_router(org_admin.router)
