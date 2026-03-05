"""Generic repository helpers for Cosmos DB (MongoDB API)."""

from typing import Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from shared.db.cosmos_client import get_database


class BaseRepository:
    """Thin wrapper around a MongoDB collection."""

    def __init__(self, collection_name: str):
        self._collection_name = collection_name

    async def _col(self):
        db: AsyncIOMotorDatabase = await get_database()
        return db[self._collection_name]

    async def insert(self, doc: dict[str, Any]) -> str:
        col = await self._col()
        result = await col.insert_one(doc)
        return str(result.inserted_id)

    async def find_by_id(self, doc_id: str, id_field: str = "goal_id") -> dict | None:
        col = await self._col()
        return await col.find_one({id_field: doc_id})

    async def find_many(self, query: dict[str, Any], limit: int = 100) -> list[dict]:
        col = await self._col()
        cursor = col.find(query).limit(limit)
        return await cursor.to_list(length=limit)

    async def update(self, doc_id: str, updates: dict[str, Any], id_field: str = "goal_id"):
        col = await self._col()
        await col.update_one({id_field: doc_id}, {"$set": updates})

    async def delete(self, doc_id: str, id_field: str = "goal_id"):
        col = await self._col()
        await col.delete_one({id_field: doc_id})

    async def upsert(self, doc_id: str, doc: dict[str, Any], id_field: str = "goal_id"):
        col = await self._col()
        await col.update_one({id_field: doc_id}, {"$set": doc}, upsert=True)


# Concrete repositories
goals_repo = BaseRepository("goals")
knowledge_repo = BaseRepository("goal_knowledge")
plans_repo = BaseRepository("plans")
users_repo = BaseRepository("user_profiles")
constraints_repo = BaseRepository("time_constraints")
logs_repo = BaseRepository("agent_logs")
