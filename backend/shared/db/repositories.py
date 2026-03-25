"""Generic repository helpers for Cosmos DB (NoSQL API)."""

from typing import Any
from azure.cosmos.aio import ContainerProxy
from azure.cosmos.exceptions import CosmosResourceNotFoundError
from shared.db.cosmos_client import get_container


class BaseRepository:
    """Thin wrapper around a Cosmos DB container."""

    def __init__(self, container_name: str, id_field: str = "goal_id"):
        self._container_name = container_name
        self._id_field = id_field

    async def _col(self) -> ContainerProxy:
        return await get_container(self._container_name)

    async def insert(self, doc: dict[str, Any]) -> str:
        col = await self._col()
        # Cosmos requires an 'id' field
        if "id" not in doc:
            doc["id"] = doc.get(self._id_field, "")
        await col.create_item(body=doc)
        return doc["id"]

    async def find_by_id(self, doc_id: str, id_field: str | None = None) -> dict | None:
        col = await self._col()
        field = id_field or self._id_field
        query = f"SELECT * FROM c WHERE c.{field} = @id"
        params = [{"name": "@id", "value": doc_id}]
        items = [item async for item in col.query_items(query=query, parameters=params)]
        return items[0] if items else None

    async def find_many(self, query_filter: dict[str, Any], limit: int = 100) -> list[dict]:
        col = await self._col()
        # Build WHERE clauses from filter dict
        clauses = []
        params = []
        for i, (key, value) in enumerate(query_filter.items()):
            clauses.append(f"c.{key} = @p{i}")
            params.append({"name": f"@p{i}", "value": value})

        where = " AND ".join(clauses) if clauses else "1=1"
        query = f"SELECT TOP {limit} * FROM c WHERE {where}"
        items = [item async for item in col.query_items(query=query, parameters=params)]
        return items

    async def update(self, doc_id: str, updates: dict[str, Any], id_field: str | None = None):
        field = id_field or self._id_field
        existing = await self.find_by_id(doc_id, field)
        if existing:
            existing.update(updates)
            col = await self._col()
            await col.upsert_item(body=existing)

    async def delete(self, doc_id: str, id_field: str | None = None):
        field = id_field or self._id_field
        existing = await self.find_by_id(doc_id, field)
        if existing:
            col = await self._col()
            await col.delete_item(item=existing["id"], partition_key=existing.get("user_id", existing["id"]))

    async def upsert(self, doc_id: str, doc: dict[str, Any], id_field: str | None = None):
        field = id_field or self._id_field
        if "id" not in doc:
            doc["id"] = doc.get(field, doc_id)
        col = await self._col()
        await col.upsert_item(body=doc)


# Concrete repositories
goals_repo = BaseRepository("goals", id_field="goal_id")
knowledge_repo = BaseRepository("goal_knowledge", id_field="goal_id")
plans_repo = BaseRepository("plans", id_field="plan_id")
users_repo = BaseRepository("user_profiles", id_field="user_id")
constraints_repo = BaseRepository("time_constraints", id_field="constraint_id")
logs_repo = BaseRepository("agent_logs", id_field="trace_id")
quiz_attempts_repo = BaseRepository("quiz_attempts", id_field="quiz_id")
