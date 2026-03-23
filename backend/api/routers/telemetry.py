"""Telemetry / trace retrieval endpoint."""

from fastapi import APIRouter, Depends, HTTPException

from shared.db.repositories import logs_repo
from shared.db.repositories import plans_repo
from api.dependencies import get_current_user_id

router = APIRouter()


@router.get("/trace/{trace_id}")
async def get_trace(trace_id: str):
    """Retrieve all agent logs for a given trace."""
    docs = await logs_repo.find_many({"trace_id": trace_id})
    if not docs:
        raise HTTPException(status_code=404, detail="Trace not found")
    return {"trace_id": trace_id, "entries": docs}


@router.get("/planner/stats")
async def get_planner_stats(user_id: str = Depends(get_current_user_id)):
    """Return planner quality and execution stats for the current user."""
    docs = await plans_repo.find_many({"user_id": user_id}, limit=500)

    total_plans = len(docs)
    total_blocks = 0
    scheduled_blocks = 0
    done_blocks = 0
    partial_blocks = 0
    missed_blocks = 0
    cancelled_blocks = 0
    estimated_hours_total = 0.0
    quality_scores: list[float] = []
    disruption_indexes: list[float] = []
    ai_confidences: list[float] = []
    used_fallback_count = 0
    retry_triggered_count = 0

    for plan in docs:
        blocks = plan.get("micro_blocks", [])
        total_blocks += len(blocks)
        estimated_hours_total += float(plan.get("total_estimated_hours", 0.0) or 0.0)

        quality = plan.get("quality_score")
        if isinstance(quality, dict):
            score = quality.get("overall_score")
            if isinstance(score, (int, float)):
                quality_scores.append(float(score))

        disruption = plan.get("disruption_index")
        if isinstance(disruption, (int, float)):
            disruption_indexes.append(float(disruption))

        if bool(plan.get("used_fallback", False)):
            used_fallback_count += 1
        if bool(plan.get("retry_triggered", False)):
            retry_triggered_count += 1

        ai_snapshot = plan.get("ai_recommendation_snapshot")
        if isinstance(ai_snapshot, dict):
            conf = ai_snapshot.get("confidence")
            if isinstance(conf, (int, float)):
                ai_confidences.append(float(conf))

        for block in blocks:
            status = str(block.get("status", "scheduled")).lower()
            if status == "scheduled":
                scheduled_blocks += 1
            elif status == "done":
                done_blocks += 1
            elif status == "partial":
                partial_blocks += 1
            elif status == "missed":
                missed_blocks += 1
            elif status == "cancelled":
                cancelled_blocks += 1

    completion_ratio = (done_blocks / total_blocks) if total_blocks else 0.0
    miss_ratio = (missed_blocks / total_blocks) if total_blocks else 0.0
    avg_blocks_per_plan = (total_blocks / total_plans) if total_plans else 0.0
    avg_quality_score = (sum(quality_scores) / len(quality_scores)) if quality_scores else None
    avg_disruption_index = (
        (sum(disruption_indexes) / len(disruption_indexes)) if disruption_indexes else None
    )
    avg_ai_confidence = (sum(ai_confidences) / len(ai_confidences)) if ai_confidences else None

    return {
        "user_id": user_id,
        "total_plans": total_plans,
        "total_blocks": total_blocks,
        "scheduled_blocks": scheduled_blocks,
        "done_blocks": done_blocks,
        "partial_blocks": partial_blocks,
        "missed_blocks": missed_blocks,
        "cancelled_blocks": cancelled_blocks,
        "completion_ratio": round(completion_ratio, 4),
        "miss_ratio": round(miss_ratio, 4),
        "avg_blocks_per_plan": round(avg_blocks_per_plan, 2),
        "estimated_hours_total": round(estimated_hours_total, 2),
        "avg_quality_score": round(avg_quality_score, 2) if avg_quality_score is not None else None,
        "avg_disruption_index": (
            round(avg_disruption_index, 4) if avg_disruption_index is not None else None
        ),
        "avg_ai_confidence": round(avg_ai_confidence, 3) if avg_ai_confidence is not None else None,
        "used_fallback_count": used_fallback_count,
        "retry_triggered_count": retry_triggered_count,
        "quality_score_available": len(quality_scores),
        "disruption_index_available": len(disruption_indexes),
        "ai_confidence_available": len(ai_confidences),
    }
