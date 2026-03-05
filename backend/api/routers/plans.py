"""Plan generation and retrieval endpoints."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_current_user_id
from shared.models import Plan
from shared.db.repositories import plans_repo, goals_repo
from agents.planner.agent import run_planner

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/generate")
async def generate_plan(
    goal_id: str,
    window: int = Query(default=7, ge=1, le=30),
    user_id: str = Depends(get_current_user_id),
):
    """Run the planner agent for the given goal."""
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")

    try:
        plan = await run_planner(goal_id, user_id, window_days=window)
        return {
            "status": "completed",
            "goal_id": goal_id,
            "plan_id": plan.plan_id,
            "blocks": len(plan.micro_blocks),
            "window": window,
        }
    except Exception as e:
        logger.exception("Planner failed for goal %s", goal_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{plan_id}", response_model=Plan)
async def get_plan(
    plan_id: str,
    user_id: str = Depends(get_current_user_id),
):
    doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Plan not found")
    return Plan(**doc)


@router.get("/goal/{goal_id}", response_model=Plan)
async def get_plan_for_goal(
    goal_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Get the active plan for a goal."""
    goal_doc = await goals_repo.find_by_id(goal_id)
    if not goal_doc or goal_doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")

    plan_id = goal_doc.get("active_plan_id")
    if not plan_id:
        raise HTTPException(status_code=404, detail="No active plan for this goal")

    doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
    if not doc:
        raise HTTPException(status_code=404, detail="Plan not found")
    return Plan(**doc)
