from fastapi import FastAPI
from app.api.main import api_router
from app.api.database.db import connect_to_db, close_db


app = FastAPI()


@app.on_event("startup")
async def startup():
    await connect_to_db()


@app.on_event("shutdown")
async def shutdown():
    await close_db()


app.include_router(api_router, prefix="")
