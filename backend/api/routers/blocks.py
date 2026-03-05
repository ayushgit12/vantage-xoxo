"""Block status update endpoint — triggers partial replan."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import get_current_user_id
from shared.models import BlockStatus
from shared.db.repositories import plans_repo
from shared.bus.service_bus import send_message
from shared.config import get_settings

router = APIRouter()


class StatusUpdate(BaseModel):
    status: BlockStatus


@router.post("/{block_id}/status")
async def update_block_status(
    block_id: str,
    body: StatusUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """Mark a micro block as done/partial/missed and trigger partial replan."""
    # Find the plan containing this block
    plans = await plans_repo.find_many({"user_id": user_id, "micro_blocks.block_id": block_id})
    if not plans:
        raise HTTPException(status_code=404, detail="Block not found")

    plan_doc = plans[0]

    # Update block status in the plan document
    for block in plan_doc.get("micro_blocks", []):
        if block["block_id"] == block_id:
            block["status"] = body.status
            break

    await plans_repo.update(
        plan_doc["plan_id"],
        {"micro_blocks": plan_doc["micro_blocks"]},
        id_field="plan_id",
    )

    # If missed or partial, trigger partial replan
    if body.status in (BlockStatus.MISSED, BlockStatus.PARTIAL):
        settings = get_settings()
        await send_message(
            settings.service_bus_queue_planner,
            {
                "goal_id": plan_doc["goal_id"],
                "user_id": user_id,
                "window_days": 7,
                "replan": True,
                "trigger_block_id": block_id,
            },
        )
        return {"status": "updated", "replan": "queued"}

    return {"status": "updated", "replan": "none"}
