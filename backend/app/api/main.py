from fastapi import APIRouter
from app.api.routes.auth import auth
from app.api.routes.data import data
from app.api.routes.data import documents
from app.api.routes.data import document_templates

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(data.router)
api_router.include_router(documents.router)
api_router.include_router(document_templates.router)

