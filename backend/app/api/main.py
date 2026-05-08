from fastapi import APIRouter
from app.api.routes.auth import auth
from app.api.routes.data import data

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(data.router)

