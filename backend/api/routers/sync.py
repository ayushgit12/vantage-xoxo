"""Calendar sync endpoint — triggers Executor agent."""

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_current_user_id
from shared.db.repositories import plans_repo
from shared.bus.service_bus import send_message
from shared.config import get_settings

router = APIRouter()


@router.post("/calendar/{plan_id}")
async def sync_calendar(
    plan_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Trigger idempotent calendar sync for a plan."""
    doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Plan not found")

    settings = get_settings()
    await send_message(
        settings.service_bus_queue_executor,
        {"plan_id": plan_id, "user_id": user_id, "action": "sync_calendar"},
    )
    return {"status": "queued", "plan_id": plan_id}
