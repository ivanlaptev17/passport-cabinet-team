from fastapi import APIRouter
from app.api.routes.example_auth import hello_world
from app.api.routes.auth import auth

api_router = APIRouter()

api_router.include_router(hello_world.router)
api_router.include_router(auth.router)
