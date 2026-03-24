"""Block status update endpoint — triggers partial replan."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.planner.agent import replan_all_goals
from agents.executor.status_tracker import validate_status_transition
from api.dependencies import get_current_user_id
from shared.models import BlockStatus
from shared.db.repositories import plans_repo

router = APIRouter()


class StatusUpdate(BaseModel):
    status: BlockStatus


async def _find_plan_by_block_id(user_id: str, block_id: str) -> dict | None:
    """Find the owning plan document for a nested micro block.

    Cosmos nested-array queries were returning false negatives here, so keep the
    lookup simple and scan the current user's plans in application code.
    """
    plans = await plans_repo.find_many({"user_id": user_id}, limit=250)
    for plan in plans:
        for block in plan.get("micro_blocks", []):
            if block.get("block_id") == block_id:
                return plan
    return None


def _apply_block_status(plan_doc: dict, block_id: str, status: BlockStatus) -> bool:
    """Update a block status inside a plan document in-memory."""
    for block in plan_doc.get("micro_blocks", []):
        if block.get("block_id") == block_id:
            block["status"] = status.value if isinstance(status, BlockStatus) else str(status)
            return True
    return False


@router.post("/{block_id}/status")
async def update_block_status(
    block_id: str,
    body: StatusUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """Mark a micro block as done/partial/missed and trigger partial replan."""
    # Find the plan containing this block
    plan_doc = await _find_plan_by_block_id(user_id, block_id)
    if not plan_doc:
        raise HTTPException(status_code=404, detail="Block not found")

    # Enforce the state machine before writing anything.
    current_block = next(
        (b for b in plan_doc.get("micro_blocks", []) if b.get("block_id") == block_id),
        None,
    )
    if current_block:
        try:
            current_status = BlockStatus(current_block["status"])
        except ValueError:
            current_status = BlockStatus.SCHEDULED
        if not validate_status_transition(current_status, body.status):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid transition: '{current_status}' → '{body.status}'",
            )

    # Update block status in the plan document
    updated = _apply_block_status(plan_doc, block_id, body.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Block not found")

    await plans_repo.update(
        plan_doc["plan_id"],
        {"micro_blocks": plan_doc["micro_blocks"]},
        id_field="plan_id",
    )

    # Returning without triggering an automatic global replan,
    # to avoid user schedule churn. Replan now explicitly requires manual interaction
    # or the background daily sweeper.
    return {
        "status": "updated",
        "replan": "none",
        "goal_id": plan_doc["goal_id"],
        "plan_id": plan_doc["plan_id"],
    }
