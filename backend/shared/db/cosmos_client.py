"""Cosmos DB (NoSQL API) async client singleton."""

from azure.cosmos.aio import CosmosClient, DatabaseProxy, ContainerProxy
from shared.config import get_settings

_client: CosmosClient | None = None
_db: DatabaseProxy | None = None
_containers: dict[str, ContainerProxy] = {}


def _parse_conn_str(conn_str: str) -> tuple[str, str]:
    """Extract endpoint and key from a Cosmos DB connection string."""
    parts = {}
    for segment in conn_str.split(";"):
        segment = segment.strip()
        if "=" in segment:
            key, value = segment.split("=", 1)
            parts[key.strip()] = value.strip()
    return parts["AccountEndpoint"], parts["AccountKey"]


async def get_database() -> DatabaseProxy:
    global _client, _db
    if _db is None:
        settings = get_settings()
        endpoint, key = _parse_conn_str(settings.cosmos_connection_string)
        _client = CosmosClient(endpoint, credential=key)
        _db = _client.get_database_client(settings.cosmos_database_name)
    return _db


async def get_container(name: str) -> ContainerProxy:
    """Get (or cache) a container proxy by name. Creates container if missing."""
    if name not in _containers:
        db = await get_database()
        # create_container_if_not_exists returns the proxy
        _containers[name] = await db.create_container_if_not_exists(
            id=name, partition_key={"paths": ["/user_id"], "kind": "Hash"}
        )
    return _containers[name]


async def close_database() -> None:
    global _client, _db, _containers
    if _client:
        await _client.close()
        _client = None
        _db = None
        _containers.clear()
