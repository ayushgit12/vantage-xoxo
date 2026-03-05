"""Calendar sync endpoint — runs Executor agent."""

import logging
from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_current_user_id
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
