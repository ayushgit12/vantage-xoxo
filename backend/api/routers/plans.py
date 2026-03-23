"""Plan generation and retrieval endpoints."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_current_user_id
from shared.models import Plan
from shared.db.repositories import plans_repo, goals_repo
from agents.planner.agent import run_planner, replan_all_goals

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/replan-all")
async def replan_all(
    window: int = Query(default=7, ge=1, le=30),
    user_id: str = Depends(get_current_user_id),
):
    """Replan ALL goals together so nothing overlaps."""
    try:
        plans = await replan_all_goals(user_id, window_days=window)
        quality_scores = [
            float(p.quality_score.get("overall_score", 0.0))
            for p in plans
            if isinstance(p.quality_score, dict)
        ]
        disruptions = [
            float(p.disruption_index)
            for p in plans
            if isinstance(p.disruption_index, (int, float))
        ]
        return {
            "status": "completed",
            "goals_planned": len(plans),
            "total_blocks": sum(len(p.micro_blocks) for p in plans),
            "window": window,
            "avg_quality_score": round(sum(quality_scores) / len(quality_scores), 2) if quality_scores else None,
            "avg_disruption_index": round(sum(disruptions) / len(disruptions), 4) if disruptions else None,
            "fallback_used_count": sum(1 for p in plans if p.used_fallback),
            "retry_triggered_count": sum(1 for p in plans if p.retry_triggered),
        }
    except Exception as e:
        logger.exception("Global replan failed for user %s", user_id)
        raise HTTPException(status_code=500, detail=str(e))


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
            "quality_score": plan.quality_score,
            "risk_flags": plan.risk_flags,
            "disruption_index": plan.disruption_index,
            "used_fallback": plan.used_fallback,
            "retry_triggered": plan.retry_triggered,
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
