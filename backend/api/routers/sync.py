"""Calendar sync endpoint — runs Executor agent."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_current_user_id
from shared.config import get_settings
from shared.db.repositories import plans_repo
from agents.executor.agent import run_executor

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/calendar/{plan_id}")
async def sync_calendar(
    plan_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Run the executor agent for calendar sync."""
    doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Plan not found")

    try:
        result = await run_executor(plan_id, user_id, action="sync_calendar")
        return {"status": "completed", "plan_id": plan_id, **result}
    except Exception as e:
        logger.exception("Executor failed for plan %s", plan_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/calendar/events")
async def list_calendar_events(
    user_id: str = Depends(get_current_user_id),
    top: int = Query(default=50, ge=1, le=200),
):
    """List all events from the user's Microsoft Graph calendar."""
    settings = get_settings()

    try:
        from azure.identity.aio import ClientSecretCredential
        from msgraph import GraphServiceClient

        credential = ClientSecretCredential(
            tenant_id=settings.graph_tenant_id,
            client_id=settings.graph_client_id,
            client_secret=settings.graph_client_secret,
        )
        client = GraphServiceClient(credential)

        graph_uid = settings.graph_user_id
        if not graph_uid:
            await credential.close()
            raise HTTPException(status_code=500, detail="GRAPH_USER_ID not configured")

        result = await client.users.by_user_id(graph_uid).calendar.events.get()

        events = []
        if result and result.value:
            for ev in result.value[:top]:
                events.append({
                    "id": ev.id,
                    "subject": ev.subject,
                    "start": ev.start.date_time if ev.start else None,
                    "end": ev.end.date_time if ev.end else None,
                    "is_cancelled": ev.is_cancelled,
                    "body_preview": (ev.body_preview or "")[:200],
                })

        await credential.close()

        return {"count": len(events), "events": events}

    except ImportError:
        raise HTTPException(status_code=500, detail="msgraph-sdk not installed")
    except Exception as e:
        logger.exception("Failed to list calendar events")
        raise HTTPException(status_code=500, detail=str(e))
