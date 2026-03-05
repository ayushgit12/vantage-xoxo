"""Plan generation and retrieval endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_current_user_id
from shared.models import Plan
from shared.db.repositories import plans_repo, goals_repo
from shared.bus.service_bus import send_message
from shared.config import get_settings

router = APIRouter()


@router.post("/generate")
async def generate_plan(
    goal_id: str,
    window: int = Query(default=7, ge=1, le=30),
    user_id: str = Depends(get_current_user_id),
):
    """Enqueue a planner job for the given goal."""
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")

    settings = get_settings()
    await send_message(
        settings.service_bus_queue_planner,
        {"goal_id": goal_id, "user_id": user_id, "window_days": window},
    )
    return {"status": "queued", "goal_id": goal_id, "window": window}


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
