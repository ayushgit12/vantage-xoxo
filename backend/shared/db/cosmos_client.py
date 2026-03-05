"""Cosmos DB (MongoDB API) client singleton."""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from shared.config import get_settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def get_database() -> AsyncIOMotorDatabase:
    global _client, _db
    if _db is None:
        settings = get_settings()
        _client = AsyncIOMotorClient(settings.cosmos_connection_string)
        _db = _client[settings.cosmos_database_name]
    return _db


async def close_database() -> None:
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
