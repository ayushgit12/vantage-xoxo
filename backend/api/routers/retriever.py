"""Retriever endpoints — trigger ingestion, view GoalKnowledge, review topics."""

import logging
from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_current_user_id
from shared.models import GoalKnowledge, TopicCreateRequest, TopicUpdateRequest
from shared.db.repositories import goals_repo, knowledge_repo
from agents.retriever.agent import run_retriever
from agents.retriever.review import add_topic, delete_topic, update_topic
from shared.models.goal import GoalType

logger = logging.getLogger(__name__)
router = APIRouter()


async def _get_owned_goal_knowledge(goal_id: str, user_id: str) -> GoalKnowledge:
    goal_doc = await goals_repo.find_by_id(goal_id)
    if not goal_doc or goal_doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")

    knowledge_doc = await knowledge_repo.find_by_id(goal_id, id_field="goal_id")
    if not knowledge_doc:
        raise HTTPException(status_code=404, detail="GoalKnowledge not found")

    return GoalKnowledge(**knowledge_doc)


async def _save_knowledge(knowledge: GoalKnowledge) -> GoalKnowledge:
    await knowledge_repo.upsert(
        knowledge.goal_id,
        knowledge.model_dump(mode="json"),
        id_field="goal_id",
    )
    return knowledge


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
    return await _get_owned_goal_knowledge(goal_id, user_id)


@router.post("/knowledge/{goal_id}/topics", response_model=GoalKnowledge)
async def create_topic_override(
    goal_id: str,
    body: TopicCreateRequest,
    user_id: str = Depends(get_current_user_id),
):
    knowledge = await _get_owned_goal_knowledge(goal_id, user_id)
    try:
        updated = add_topic(knowledge, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await _save_knowledge(updated)


@router.patch("/knowledge/{goal_id}/topics/{topic_id}", response_model=GoalKnowledge)
async def patch_topic_override(
    goal_id: str,
    topic_id: str,
    body: TopicUpdateRequest,
    user_id: str = Depends(get_current_user_id),
):
    knowledge = await _get_owned_goal_knowledge(goal_id, user_id)
    try:
        updated = update_topic(knowledge, topic_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await _save_knowledge(updated)


@router.delete("/knowledge/{goal_id}/topics/{topic_id}", response_model=GoalKnowledge)
async def remove_topic_override(
    goal_id: str,
    topic_id: str,
    user_id: str = Depends(get_current_user_id),
):
    knowledge = await _get_owned_goal_knowledge(goal_id, user_id)
    try:
        updated = delete_topic(knowledge, topic_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await _save_knowledge(updated)
