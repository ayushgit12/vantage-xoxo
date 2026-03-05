"""Simple content-hash cache for LLM responses.

Stores in Cosmos DB so it persists across restarts.
Prevents duplicate Azure OpenAI calls for identical inputs.
"""

import hashlib
import json
import logging
from typing import Any

from shared.db.cosmos_client import get_container

logger = logging.getLogger(__name__)
COLLECTION = "llm_cache"


def _hash_key(data: Any) -> str:
    serialized = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()


async def get_cached(prompt_key: Any) -> dict | None:
    container = await get_container(COLLECTION)
    key = _hash_key(prompt_key)
    query = "SELECT * FROM c WHERE c._cache_key = @key"
    params = [{"name": "@key", "value": key}]
    items = [item async for item in container.query_items(query=query, parameters=params)]
    if items:
        logger.debug("Cache HIT for %s", key[:12])
        return items[0].get("response")
    return None


async def set_cached(prompt_key: Any, response: dict) -> None:
    container = await get_container(COLLECTION)
    key = _hash_key(prompt_key)
    doc = {
        "id": key,
        "_cache_key": key,
        "response": response,
        "user_id": "system",  # partition key
    }
    await container.upsert_item(body=doc)
    logger.debug("Cache SET for %s", key[:12])
