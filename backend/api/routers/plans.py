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


# --- B4: Daily summary endpoint (A6: wires up reminders.py) ---

@router.get("/daily-summary")
async def daily_summary(
    user_id: str = Depends(get_current_user_id),
):
    """Get today's schedule summary across all active goals."""
    from agents.executor.reminders import generate_daily_summary

    all_goals = await goals_repo.find_many({"user_id": user_id})
    summaries = []
    total_blocks = 0
    total_minutes = 0
    total_done = 0

    for goal_doc in all_goals:
        if goal_doc.get("status") != "active":
            continue
        plan_id = goal_doc.get("active_plan_id")
        if not plan_id:
            continue
        plan_doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
        if not plan_doc:
            continue

        plan = Plan(**plan_doc)
        summary = generate_daily_summary(plan)
        if summary["total_blocks"] > 0:
            summary["goal_id"] = goal_doc["goal_id"]
            summary["goal_title"] = goal_doc.get("title", "")
            summaries.append(summary)
            total_blocks += summary["total_blocks"]
            total_minutes += summary["total_minutes"]
            total_done += summary["done"]

    return {
        "date": summaries[0]["date"] if summaries else None,
        "total_blocks": total_blocks,
        "total_minutes": total_minutes,
        "total_done": total_done,
        "total_remaining": total_blocks - total_done,
        "goals": summaries,
    }


# --- B5: Progress endpoint ---

@router.get("/goal/{goal_id}/progress")
async def get_goal_progress(
    goal_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Get progress stats for a goal: completion %, done hours, remaining hours."""
    goal_doc = await goals_repo.find_by_id(goal_id)
    if not goal_doc or goal_doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")

    plan_id = goal_doc.get("active_plan_id")
    if not plan_id:
        raise HTTPException(status_code=404, detail="No active plan for this goal")

    plan_doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
    if not plan_doc:
        raise HTTPException(status_code=404, detail="Plan not found")

    total_est_hours = float(plan_doc.get("total_estimated_hours", 0) or 0)

    done_minutes = 0
    partial_minutes = 0
    missed_minutes = 0
    scheduled_minutes = 0
    blocks_done = 0
    blocks_remaining = 0

    for block in plan_doc.get("micro_blocks", []):
        status = block.get("status", "scheduled")
        dur = int(block.get("duration_min", 0) or 0)
        if status == "done":
            done_minutes += dur
            blocks_done += 1
        elif status == "partial":
            partial_minutes += dur
            blocks_done += 1
        elif status == "missed":
            missed_minutes += dur
        elif status == "scheduled":
            scheduled_minutes += dur
            blocks_remaining += 1

    effective_done_minutes = done_minutes + (partial_minutes // 2)
    total_est_minutes = total_est_hours * 60
    completion_pct = (
        round((effective_done_minutes / total_est_minutes) * 100, 1)
        if total_est_minutes > 0
        else 0.0
    )

    return {
        "goal_id": goal_id,
        "total_estimated_hours": total_est_hours,
        "done_hours": round(done_minutes / 60, 1),
        "partial_hours": round(partial_minutes / 60, 1),
        "missed_hours": round(missed_minutes / 60, 1),
        "scheduled_hours": round(scheduled_minutes / 60, 1),
        "effective_done_hours": round(effective_done_minutes / 60, 1),
        "completion_pct": min(completion_pct, 100.0),
        "blocks_done": blocks_done,
        "blocks_remaining": blocks_remaining,
        "is_complete": completion_pct >= 100.0,
    }
