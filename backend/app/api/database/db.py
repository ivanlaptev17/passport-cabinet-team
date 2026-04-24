import asyncio
import asyncpg
import os

DATABASE_URL = os.getenv("DATABASE_URL")

pool = None


async def connect_to_db():
    global pool

    retries = 10
    delay = 2

    for attempt in range(1, retries + 1):
        try:
            pool = await asyncpg.create_pool(DATABASE_URL)
            print("✅ Connected to database")
            return
        except Exception as e:
            print(f"⏳ DB is not ready yet (attempt {attempt}/{retries}): {e}")
            if attempt == retries:
                raise
            await asyncio.sleep(delay)


async def close_db():
    global pool
    if pool is not None:
        await pool.close()


async def get_connection():
    async with pool.acquire() as connection:
        yield connection
