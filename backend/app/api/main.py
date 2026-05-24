from fastapi import APIRouter
from app.api.routes.auth import auth
from app.api.routes.data import data
from app.api.routes.data import documents

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(data.router)
api_router.include_router(documents.router)

