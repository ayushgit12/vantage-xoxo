"""Simple content-hash cache for LLM responses.

Stores in Cosmos DB so it persists across restarts.
Prevents duplicate Azure OpenAI calls for identical inputs.
"""

import hashlib
import json
import logging
from typing import Any

from shared.db.cosmos_client import get_database

logger = logging.getLogger(__name__)
COLLECTION = "llm_cache"


def _hash_key(data: Any) -> str:
    serialized = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()


async def get_cached(prompt_key: Any) -> dict | None:
    db = await get_database()
    key = _hash_key(prompt_key)
    doc = await db[COLLECTION].find_one({"_cache_key": key})
    if doc:
        logger.debug("Cache HIT for %s", key[:12])
        return doc.get("response")
    return None


async def set_cached(prompt_key: Any, response: dict) -> None:
    db = await get_database()
    key = _hash_key(prompt_key)
    await db[COLLECTION].update_one(
        {"_cache_key": key},
        {"$set": {"_cache_key": key, "response": response}},
        upsert=True,
    )
    logger.debug("Cache SET for %s", key[:12])
