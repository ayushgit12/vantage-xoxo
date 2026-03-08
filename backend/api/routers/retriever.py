"""Retriever endpoints — trigger ingestion, view GoalKnowledge."""

import logging
from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_current_user_id
from shared.models import GoalKnowledge
from shared.db.repositories import goals_repo, knowledge_repo
from agents.retriever.agent import run_retriever
from shared.models.goal import GoalType

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/ingest")
async def trigger_ingest(
    goal_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Run the retriever agent for the given goal."""
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")
    if doc.get("goal_type") == GoalType.HABIT:
        raise HTTPException(status_code=400, detail="Retriever is not applicable to habit goals")

    try:
        knowledge = await run_retriever(goal_id, user_id)
        return {
            "status": "completed",
            "goal_id": goal_id,
            "topics": len(knowledge.topics),
            "estimated_hours": knowledge.estimated_total_hours,
        }
    except Exception as e:
        logger.exception("Retriever failed for goal %s", goal_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/knowledge/{goal_id}", response_model=GoalKnowledge)
async def get_knowledge(
    goal_id: str,
    user_id: str = Depends(get_current_user_id),
):
    doc = await knowledge_repo.find_by_id(goal_id, id_field="goal_id")
    if not doc:
        raise HTTPException(status_code=404, detail="GoalKnowledge not found")
    return GoalKnowledge(**doc)
