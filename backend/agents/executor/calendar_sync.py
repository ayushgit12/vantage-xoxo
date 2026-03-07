"""Microsoft Graph calendar sync — idempotent event creation/patching.

Uses external_event_id on MicroBlock to prevent duplicates.
Requires Graph API consent (delegated or app-only).
"""

import logging
from datetime import timedelta
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
    graph_uid = settings.graph_user_id
    if not graph_uid:
        logger.error("GRAPH_USER_ID not set — cannot sync calendar")
        return {"synced": 0, "errors": 0, "message": "GRAPH_USER_ID not configured"}

    synced = 0
    errors = 0

    try:
        from azure.identity.aio import ClientSecretCredential
        from msgraph import GraphServiceClient
        from msgraph.generated.models.event import Event
        from msgraph.generated.models.item_body import ItemBody
        from msgraph.generated.models.body_type import BodyType
        from msgraph.generated.models.date_time_time_zone import DateTimeTimeZone

        credential = ClientSecretCredential(
            tenant_id=settings.graph_tenant_id,
            client_id=settings.graph_client_id,
            client_secret=settings.graph_client_secret,
        )
        client = GraphServiceClient(credential)

        for block in plan.micro_blocks:
            try:
                event = _build_event(block, plan.goal_id)

                if block.external_event_id:
                    await client.users.by_user_id(graph_uid).calendar.events.by_event_id(
                        block.external_event_id
                    ).patch(event)
                else:
                    result = await client.users.by_user_id(graph_uid).calendar.events.post(
                        event
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


def _build_event(block: MicroBlock, goal_id: str):
    """Build a Graph API Event model from a MicroBlock."""
    from msgraph.generated.models.event import Event
    from msgraph.generated.models.item_body import ItemBody
    from msgraph.generated.models.body_type import BodyType
    from msgraph.generated.models.date_time_time_zone import DateTimeTimeZone

    end_dt = block.start_dt + timedelta(minutes=block.duration_min)

    event = Event()
    event.subject = f"[Vantage] Study: {block.topic_id[:8]}"

    body = ItemBody()
    body.content_type = BodyType.Text
    body.content = f"Goal: {goal_id}\nTopic: {block.topic_id}\nBlock: {block.block_id}"
    event.body = body

    start = DateTimeTimeZone()
    start.date_time = block.start_dt.isoformat()
    start.time_zone = "UTC"
    event.start = start

    end = DateTimeTimeZone()
    end.date_time = end_dt.isoformat()
    end.time_zone = "UTC"
    event.end = end

    event.is_reminder_on = True
    event.reminder_minutes_before_start = 15

    return event
