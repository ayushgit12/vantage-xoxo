"""Purge old live data from Cosmos containers before validation runs.

This script is intentionally destructive for configured app containers.
It is intended to run BEFORE live validation tests so newly created test data
remains available after tests complete.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from azure.cosmos.exceptions import CosmosResourceNotFoundError

# Make backend package imports work when running this file directly.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from shared.db.cosmos_client import close_database, get_database

# Keep this list aligned with repository containers used by live tests.
CONTAINERS = [
    "goals",
    "goal_knowledge",
    "plans",
    "user_profiles",
    "time_constraints",
    "agent_logs",
    "llm_cache",
]


async def _reset_container(container_name: str) -> tuple[int, int, int]:
    """Drop and recreate a container so all legacy rows are guaranteed purged."""
    db = await get_database()
    dropped = 0
    recreated = 0
    failed = 0

    try:
        await db.delete_container(container_name)
        dropped = 1
    except CosmosResourceNotFoundError:
        dropped = 0
    except Exception:
        failed = 1
        return dropped, recreated, failed

    try:
        await db.create_container_if_not_exists(
            id=container_name,
            partition_key={"paths": ["/user_id"], "kind": "Hash"},
        )
        recreated = 1
    except Exception:
        failed = 1

    return dropped, recreated, failed


async def main() -> int:
    print("Starting live-data purge...")
    print("Containers:", ", ".join(CONTAINERS))

    total_dropped = 0
    total_recreated = 0
    total_failed = 0

    try:
        for name in CONTAINERS:
            dropped, recreated, failed = await _reset_container(name)
            total_dropped += dropped
            total_recreated += recreated
            total_failed += failed
            print(
                f"[purge] container={name} dropped={dropped} recreated={recreated} failed={failed}"
            )
    finally:
        await close_database()

    print(
        "Purge complete: "
        f"total_dropped={total_dropped} total_recreated={total_recreated} total_failed={total_failed}"
    )
    # Do not fail the run on partial purge failures; validation can still proceed.
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
