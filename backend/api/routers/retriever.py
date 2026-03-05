"""Retriever endpoints — trigger ingestion, view GoalKnowledge."""

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_current_user_id
from shared.models import GoalKnowledge
from shared.db.repositories import goals_repo, knowledge_repo
from shared.bus.service_bus import send_message
from shared.config import get_settings

router = APIRouter()


@router.post("/ingest")
async def trigger_ingest(
    goal_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Enqueue a retriever job for the given goal."""
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")

    settings = get_settings()
    await send_message(
        settings.service_bus_queue_retriever,
        {"goal_id": goal_id, "user_id": user_id},
    )
    return {"status": "queued", "goal_id": goal_id}


@router.get("/knowledge/{goal_id}", response_model=GoalKnowledge)
async def get_knowledge(
    goal_id: str,
    user_id: str = Depends(get_current_user_id),
):
    doc = await knowledge_repo.find_by_id(goal_id, id_field="goal_id")
    if not doc:
        raise HTTPException(status_code=404, detail="GoalKnowledge not found")
    return GoalKnowledge(**doc)
