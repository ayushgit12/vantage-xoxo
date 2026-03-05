"""Goal CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from typing import Optional

from api.dependencies import get_current_user_id
from shared.models import Goal, GoalCreate, GoalUpdate
from shared.db.repositories import goals_repo
from shared.config import get_settings

router = APIRouter()


@router.post("", response_model=Goal)
async def create_goal(
    body: GoalCreate,
    user_id: str = Depends(get_current_user_id),
):
    goal = Goal(user_id=user_id, **body.model_dump())
    await goals_repo.insert(goal.model_dump())
    return goal


@router.get("", response_model=list[Goal])
async def list_goals(user_id: str = Depends(get_current_user_id)):
    docs = await goals_repo.find_many({"user_id": user_id})
    return [Goal(**d) for d in docs]


@router.get("/{goal_id}", response_model=Goal)
async def get_goal(goal_id: str, user_id: str = Depends(get_current_user_id)):
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")
    return Goal(**doc)


@router.patch("/{goal_id}", response_model=Goal)
async def update_goal(
    goal_id: str,
    body: GoalUpdate,
    user_id: str = Depends(get_current_user_id),
):
    doc = await goals_repo.find_by_id(goal_id)
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        await goals_repo.update(goal_id, updates)
    updated = await goals_repo.find_by_id(goal_id)
    return Goal(**updated)


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
