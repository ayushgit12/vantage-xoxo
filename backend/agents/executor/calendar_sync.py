"""Microsoft Graph calendar sync — idempotent event creation/patching.

Uses external_event_id on MicroBlock to prevent duplicates.
Requires Graph API consent (delegated or app-only).
"""

import logging
from shared.models import Plan, MicroBlock
from shared.config import get_settings

logger = logging.getLogger(__name__)


async def sync_plan_to_calendar(
    plan: Plan,
    user_id: str,
    calendar_id: str | None = None,
) -> dict:
    """Create/patch calendar events for each micro block."""
    settings = get_settings()
    synced = 0
    errors = 0

    try:
        from azure.identity.aio import ClientSecretCredential
        from msgraph import GraphServiceClient

        credential = ClientSecretCredential(
            tenant_id=settings.graph_tenant_id,
            client_id=settings.graph_client_id,
            client_secret=settings.graph_client_secret,
        )
        client = GraphServiceClient(credential)

        for block in plan.micro_blocks:
            try:
                event_body = _build_event(block, plan.goal_id)

                if block.external_event_id:
                    # Patch existing event
                    await client.users.by_user_id(user_id).calendar.events.by_event_id(
                        block.external_event_id
                    ).patch(event_body)
                else:
                    # Create new event
                    result = await client.users.by_user_id(user_id).calendar.events.post(
                        event_body
                    )
                    block.external_event_id = result.id

                synced += 1
            except Exception as e:
                logger.warning("Failed to sync block %s: %s", block.block_id, e)
                errors += 1

        await credential.close()

    except ImportError:
        logger.error("msgraph-sdk not available; cannot sync calendar")
        return {"synced": 0, "errors": 0, "message": "Graph SDK not installed"}

    logger.info("Calendar sync: %d synced, %d errors", synced, errors)
    return {"synced": synced, "errors": errors}


def _build_event(block: MicroBlock, goal_id: str) -> dict:
    """Build a Graph API event body from a MicroBlock."""
    end_dt = block.start_dt + __import__("datetime").timedelta(minutes=block.duration_min)

    return {
        "subject": f"[Vantage] Study: {block.topic_id[:8]}",
        "body": {
            "contentType": "text",
            "content": f"Goal: {goal_id}\nTopic: {block.topic_id}\nBlock: {block.block_id}",
        },
        "start": {
            "dateTime": block.start_dt.isoformat(),
            "timeZone": "UTC",
        },
        "end": {
            "dateTime": end_dt.isoformat(),
            "timeZone": "UTC",
        },
        "isReminderOn": True,
        "reminderMinutesBeforeStart": 15,
    }
