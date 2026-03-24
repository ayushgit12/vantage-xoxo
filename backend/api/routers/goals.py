"""Goal CRUD endpoints."""

import json
import logging
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
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
from shared.models.goal import GoalStatus
from shared.db.repositories import goals_repo, knowledge_repo, plans_repo
from shared.config import get_settings
from shared.ai import run_prompt_via_graph
from agents.intake.agent import parse_scenario_to_goal

router = APIRouter()
logger = logging.getLogger(__name__)


class ScenarioSuggestionRequest(BaseModel):
    scenario_text: str = Field(min_length=5, max_length=2000)


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

    status = _normalize_goal_enum(doc.get("status"), GoalStatus, GoalStatus.ACTIVE.value)
    if doc.get("status") != status:
        normalized["status"] = status
        updates["status"] = status

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

    if normalized.get("completed_at") is None and normalized.get("status") == GoalStatus.COMPLETED.value:
        normalized["completed_at"] = normalized.get("updated_at")
        updates["completed_at"] = normalized.get("updated_at")

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


@router.post("/scenario-suggestions")
async def get_scenario_suggestions(
    body: ScenarioSuggestionRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate 1-2 stronger scenario variants from a user's draft scenario."""
    del user_id

    base = body.scenario_text.strip()
    prompt = (
        "You improve user-written goal scenarios for better planning outcomes.\n\n"
        "Given an input scenario, generate 1 or 2 improved scenario variants that are:\n"
        "- related to the original intent\n"
        "- slightly expanded with a meaningful progression or adjacent challenge\n"
        "- still realistic and actionable\n"
        "- phrased as a user goal sentence starting with 'I want to'\n"
        "- NOT just the same sentence with tiny wording changes\n"
        "- max 24 words each\n\n"
        "Return strict JSON only:\n"
        "{\n"
        "  \"suggestions\": [\"...\", \"...\"]\n"
        "}\n\n"
        "Example:\n"
        "Input: I want to do pullups\n"
        "Good: I want to do pullups and progress to controlled weighted pullups\n"
        "Good: I want to do pullups and build grip strength with dead hangs\n"
        "Bad: I want to do more pullups\n\n"
        f"Input scenario: {base}\n"
    )

    try:
        result_text = run_prompt_via_graph(
            prompt,
            temperature=0.35,
            json_mode=True,
            model="gpt-4.1",
        ).strip()
        result_text = re.sub(r"^```(?:json)?\s*\n?", "", result_text)
        result_text = re.sub(r"\n?```\s*$", "", result_text).strip()
        payload = json.loads(result_text)
    except Exception as exc:
        logger.exception("Scenario suggestion generation failed")
        raise HTTPException(status_code=500, detail="Could not generate scenario suggestions") from exc

    raw = payload.get("suggestions", [])
    if not isinstance(raw, list):
        raw = []

    normalized_base = re.sub(r"[^a-z0-9\\s]", "", base.lower()).strip()
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = str(item).strip().strip("- ").strip()
        if not text:
            continue
        if not text.lower().startswith("i want to"):
            text = f"I want to {text[0].lower() + text[1:] if len(text) > 1 else text.lower()}"
        key = text.lower()
        if key in seen:
            continue

        similarity = SequenceMatcher(
            None,
            re.sub(r"[^a-z0-9\\s]", "", key),
            normalized_base,
        ).ratio()
        if similarity >= 0.86:
            continue

        seen.add(key)
        cleaned.append(text)
        if len(cleaned) == 2:
            break

    if not cleaned:
        cleaned = [
            f"I want to {base.lower()} and add one complementary progression goal",
        ]

    return {"suggestions": cleaned}


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


@router.get("/{goal_id}/suggestions")
async def get_related_goal_suggestions(
    goal_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Generate 1-2 related follow-up goal suggestions for the current goal."""
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")

    prompt = (
        "You are helping users discover adjacent SKILL goals. "
        "Given one goal, suggest only 1 or 2 related goals they can do next.\n\n"
        "Return strict JSON only:\n"
        "{\n"
        "  \"suggestions\": [\"...\", \"...\"]\n"
        "}\n\n"
        "Rules:\n"
        "- 1 or 2 suggestions only\n"
        "- each suggestion max 12 words\n"
        "- concrete and actionable\n"
        "- prefer adjacent skill progressions (prerequisite/companion next skills)\n"
        "- suggestions must be different goals, not a variation of the same goal\n"
        "- do NOT suggest increasing/improving/counting the exact same core activity\n"
        "- suggest tangible training goals, not tracking/admin tasks\n"
        "- avoid suggestions about journals, logging, notes, or reminders\n"
        "- avoid repeating the exact same goal\n"
        "- each suggestion should be written like a goal sentence starting with 'I want to'\n"
        "- no numbering, no bullets, no explanation\n\n"
        "Style examples:\n"
        "- If goal is pullups, good: 'Build pushup strength for upper-body endurance'\n"
        "- If goal is pullups, good: 'Train scapular pullups and dead hangs for control'\n"
        "- If goal is pullups, bad: 'Track pullup progress in a workout journal'\n\n"
        f"Current goal title: {doc.get('title', '')}\n"
        f"Current goal description: {doc.get('description', '')}\n"
        f"Current goal type: {doc.get('goal_type', '')}\n"
        f"Current goal category: {doc.get('category', '')}\n"
    )

    try:
        result_text = run_prompt_via_graph(
            prompt,
            temperature=0.3,
            json_mode=True,
            model="gpt-4.1",
        ).strip()
        result_text = re.sub(r"^```(?:json)?\s*\n?", "", result_text)
        result_text = re.sub(r"\n?```\s*$", "", result_text).strip()
        payload = json.loads(result_text)
    except Exception as exc:
        logger.exception("Goal suggestion generation failed for %s", goal_id)
        raise HTTPException(status_code=500, detail="Could not generate suggestions") from exc

    raw_suggestions = payload.get("suggestions", [])
    if not isinstance(raw_suggestions, list):
        raw_suggestions = []

    def _normalize(text: str) -> str:
        return re.sub(r"[^a-z0-9\s]", "", text.lower()).strip()

    stop_words = {
        "i", "want", "to", "learn", "improve", "increase", "build", "the", "a", "an",
        "and", "for", "with", "of", "in", "on", "my", "daily", "weekly", "goal",
    }

    def _tokens(text: str) -> set[str]:
        return {
            tok for tok in _normalize(text).split()
            if len(tok) >= 4 and tok not in stop_words
        }

    goal_title = str(doc.get("title", ""))
    goal_desc = str(doc.get("description", ""))
    goal_text = f"{goal_title} {goal_desc}".strip()
    goal_text_norm = _normalize(goal_text)
    goal_tokens = _tokens(goal_text)

    cleaned: list[str] = []
    seen: set[str] = set()
    blocked_terms = {
        "journal",
        "track",
        "log",
        "logging",
        "note",
        "notes",
        "reminder",
        "reminders",
    }
    for item in raw_suggestions:
        text = str(item).strip().strip("- ").strip()
        if not text:
            continue
        if not text.lower().startswith("i want to"):
            text = f"I want to {text[0].lower() + text[1:] if len(text) > 1 else text.lower()}"

        key = text.lower()
        if not text or key in seen:
            continue
        if any(term in key for term in blocked_terms):
            continue

        suggestion_norm = _normalize(text)
        if not suggestion_norm:
            continue

        # Reject near-duplicates of the original goal phrasing.
        if goal_text_norm and SequenceMatcher(None, suggestion_norm, goal_text_norm).ratio() >= 0.58:
            continue

        # Reject suggestions that overlap too heavily with core goal tokens.
        suggestion_tokens = _tokens(text)
        if goal_tokens and suggestion_tokens:
            overlap = len(goal_tokens & suggestion_tokens) / max(1, len(goal_tokens))
            if overlap >= 0.65:
                continue

        seen.add(key)
        cleaned.append(text)
        if len(cleaned) == 2:
            break

    if not cleaned:
        category = str(doc.get("category", "")).lower()
        fallback_by_category: dict[str, list[str]] = {
            "fitness": [
                "I want to improve core strength and stability",
                "I want to build shoulder mobility and joint control",
            ],
            "course": [
                "I want to strengthen note-taking and active recall",
                "I want to practice spaced revision every week",
            ],
            "skill": [
                "I want to practice foundational drills consistently",
                "I want to improve speed and accuracy with timed practice",
            ],
            "project": [
                "I want to improve problem decomposition for larger tasks",
                "I want to strengthen testing and debugging workflow",
            ],
        }
        cleaned = fallback_by_category.get(
            category,
            [
                "I want to build a complementary foundational skill",
                "I want to practice a related skill with progressive difficulty",
            ],
        )[:2]

    return {"goal_id": goal_id, "suggestions": cleaned}


@router.patch("/{goal_id}", response_model=Goal)
async def update_goal(
    goal_id: str,
    body: GoalUpdate,
    user_id: str = Depends(get_current_user_id),
):
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")
    updates = body.model_dump(exclude_unset=True, mode="json")
    if updates.get("status") == GoalStatus.COMPLETED.value and "completed_at" not in updates:
        from datetime import datetime, timezone

        updates["completed_at"] = datetime.now(timezone.utc).isoformat()
    elif updates.get("status") in {GoalStatus.ACTIVE.value, GoalStatus.PAUSED.value, GoalStatus.ARCHIVED.value}:
        updates["completed_at"] = None
    if updates:
        await goals_repo.update(goal_id, updates)
    updated = await goals_repo.find_by_id(goal_id)
    return await _goal_from_doc(updated)


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, user_id: str = Depends(get_current_user_id)):
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")

    # A7 FIX: Cascade delete associated knowledge and ALL plan documents.
    try:
        await knowledge_repo.delete(goal_id, id_field="goal_id")
    except Exception:
        pass  # Knowledge may not exist for habit goals

    # Delete all historical plans for this goal
    try:
        all_plans = await plans_repo.find_many({"goal_id": goal_id}, limit=1000)
        for plan in all_plans:
            await plans_repo.delete(plan["plan_id"], id_field="plan_id")
    except Exception:
        pass

    # Delete uploaded files from blob storage
    file_ids = doc.get("uploaded_file_ids", [])
    if file_ids:
        try:
            from azure.storage.blob.aio import BlobServiceClient
            settings = get_settings()
            blob_client = BlobServiceClient.from_connection_string(
                settings.azure_storage_connection_string
            )
            container = blob_client.get_container_client(settings.azure_storage_container)
            for file_id in file_ids:
                try:
                    blob = container.get_blob_client(file_id)
                    await blob.delete_blob()
                except Exception:
                    pass
            await blob_client.close()
        except Exception as e:
            logger.warning("Failed to cascade delete blobs for goal %s: %s", goal_id, e)

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
