"""Goal CRUD endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from typing import Optional

from api.dependencies import get_current_user_id
from shared.models import (
    Goal,
    GoalCreate,
    GoalUpdate,
    ScenarioIntakeRequest,
    ScenarioIntakeResponse,
)
from shared.models.goal import GoalCategory, GoalPriority, GoalType
from shared.db.repositories import goals_repo
from shared.config import get_settings
from agents.intake.agent import parse_scenario_to_goal

router = APIRouter()
logger = logging.getLogger(__name__)


def _normalize_goal_enum(value, enum_cls, default_value: str) -> str:
    if value is None:
        return default_value
    candidate = str(value).strip().lower()
    try:
        return enum_cls(candidate).value
    except ValueError:
        return default_value


def _normalize_goal_doc(doc: dict) -> tuple[dict, dict]:
    normalized = dict(doc)
    updates: dict = {}

    goal_type = _normalize_goal_enum(doc.get("goal_type"), GoalType, GoalType.LEARNING.value)
    if doc.get("goal_type") != goal_type:
        normalized["goal_type"] = goal_type
        updates["goal_type"] = goal_type

    category = _normalize_goal_enum(doc.get("category"), GoalCategory, GoalCategory.OTHER.value)
    if doc.get("category") != category:
        normalized["category"] = category
        updates["category"] = category

    priority = _normalize_goal_enum(doc.get("priority"), GoalPriority, GoalPriority.MEDIUM.value)
    if doc.get("priority") != priority:
        normalized["priority"] = priority
        updates["priority"] = priority

    if normalized.get("description") is None:
        normalized["description"] = ""
        updates["description"] = ""

    if normalized.get("material_urls") is None:
        normalized["material_urls"] = []
        updates["material_urls"] = []

    if normalized.get("uploaded_file_ids") is None:
        normalized["uploaded_file_ids"] = []
        updates["uploaded_file_ids"] = []

    if normalized.get("prefer_user_materials_only") is None:
        normalized["prefer_user_materials_only"] = False
        updates["prefer_user_materials_only"] = False

    return normalized, updates


async def _goal_from_doc(doc: dict) -> Goal:
    normalized, updates = _normalize_goal_doc(doc)
    if updates and doc.get("goal_id"):
        logger.info("Normalized legacy goal doc %s with updates: %s", doc.get("goal_id"), sorted(updates.keys()))
        await goals_repo.update(doc["goal_id"], updates)
    return Goal(**normalized)


@router.post("/intake", response_model=ScenarioIntakeResponse)
async def intake_scenario(
    body: ScenarioIntakeRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Parse free-form scenario text into a structured goal preview."""
    del user_id  # auth check for parity with other goal routes
    try:
        goal_preview, meta = await parse_scenario_to_goal(
            scenario_text=body.scenario_text,
            overrides=body.overrides,
        )
    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ScenarioIntakeResponse(
        scenario_text=body.scenario_text,
        inferred_goal_type=meta["inferred_goal_type"],
        confidence=meta["confidence"],
        assumptions=meta["assumptions"],
        warnings=meta["warnings"],
        goal_preview=goal_preview.model_dump(mode="json"),
    )


@router.post("/from-scenario", response_model=Goal)
async def create_goal_from_scenario(
    body: ScenarioIntakeRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Create a goal directly from scenario text with optional overrides."""
    try:
        goal_create, _ = await parse_scenario_to_goal(
            scenario_text=body.scenario_text,
            overrides=body.overrides,
        )
    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    goal = Goal(user_id=user_id, **goal_create.model_dump())
    await goals_repo.insert(goal.model_dump(mode="json"))
    return goal


@router.post("", response_model=Goal)
async def create_goal(
    body: GoalCreate,
    user_id: str = Depends(get_current_user_id),
):
    goal = Goal(user_id=user_id, **body.model_dump())
    await goals_repo.insert(goal.model_dump(mode="json"))
    return goal


@router.get("", response_model=list[Goal])
async def list_goals(user_id: str = Depends(get_current_user_id)):
    docs = await goals_repo.find_many({"user_id": user_id})
    goals: list[Goal] = []
    for doc in docs:
        goals.append(await _goal_from_doc(doc))
    return goals


@router.get("/{goal_id}", response_model=Goal)
async def get_goal(goal_id: str, user_id: str = Depends(get_current_user_id)):
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")
    return await _goal_from_doc(doc)


@router.patch("/{goal_id}", response_model=Goal)
async def update_goal(
    goal_id: str,
    body: GoalUpdate,
    user_id: str = Depends(get_current_user_id),
):
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")
    updates = body.model_dump(exclude_none=True, mode="json")
    if updates:
        await goals_repo.update(goal_id, updates)
    updated = await goals_repo.find_by_id(goal_id)
    return await _goal_from_doc(updated)


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, user_id: str = Depends(get_current_user_id)):
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")
    await goals_repo.delete(goal_id)
    return {"deleted": goal_id}


@router.post("/{goal_id}/upload")
async def upload_material(
    goal_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Upload a file (PDF, text, markdown) for a goal."""
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")

    settings = get_settings()

    # Store file in Azure Blob Storage (or Azurite locally)
    from azure.storage.blob.aio import BlobServiceClient

    blob_client = BlobServiceClient.from_connection_string(
        settings.azure_storage_connection_string
    )
    container = blob_client.get_container_client(settings.azure_storage_container)

    # Ensure container exists
    try:
        await container.create_container()
    except Exception:
        pass  # already exists

    file_id = f"{goal_id}/{file.filename}"
    blob = container.get_blob_client(file_id)
    data = await file.read()
    await blob.upload_blob(data, overwrite=True)
    await blob_client.close()

    # Track file ID on goal
    file_ids = doc.get("uploaded_file_ids", [])
    file_ids.append(file_id)
    await goals_repo.update(goal_id, {"uploaded_file_ids": file_ids})

    return {"file_id": file_id, "filename": file.filename, "size": len(data)}
