"""Mock calendar sync for demos without Graph API consent.

Simulates calendar event creation and stores mock event IDs.
"""

import logging
from uuid import uuid4
from shared.models import Plan

logger = logging.getLogger(__name__)


async def mock_sync_plan(plan: Plan) -> dict:
    """Simulate calendar sync by assigning mock external_event_ids."""
    synced = 0

    for block in plan.micro_blocks:
        if not block.external_event_id:
            block.external_event_id = f"mock-event-{uuid4().hex[:8]}"
            synced += 1
            logger.debug(
                "Mock event created: %s → %s",
                block.block_id, block.external_event_id,
            )

    logger.info("Mock calendar sync: %d events created", synced)
    return {
        "synced": synced,
        "errors": 0,
        "mock": True,
        "message": f"Mock sync: {synced} events created (no real calendar)",
    }
