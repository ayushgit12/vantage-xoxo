"""Time constraint endpoints used by planner availability."""

from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.dependencies import get_current_user_id
from shared.db.repositories import constraints_repo
from shared.models import ConstraintType, TimeConstraint

router = APIRouter()


class ConstraintCreate(BaseModel):
    type: ConstraintType
    title: str = ""
    start_time: datetime | None = None
    end_time: datetime | None = None
    recurrence_rule: str | None = None
    recurring_start: time | None = None
    recurring_end: time | None = None
    recurring_days: list[int] = Field(default_factory=list)


class ConstraintUpdate(BaseModel):
    title: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    recurrence_rule: str | None = None
    recurring_start: time | None = None
    recurring_end: time | None = None
    recurring_days: list[int] | None = None


@router.get("", response_model=list[TimeConstraint])
async def list_constraints(user_id: str = Depends(get_current_user_id)):
    docs = await constraints_repo.find_many({"user_id": user_id}, limit=250)
    return [TimeConstraint(**doc) for doc in docs]


@router.post("", response_model=TimeConstraint)
async def create_constraint(body: ConstraintCreate, user_id: str = Depends(get_current_user_id)):
    constraint = TimeConstraint(user_id=user_id, **body.model_dump(mode="json"))
    await constraints_repo.insert(constraint.model_dump(mode="json"))
    return constraint


@router.patch("/{constraint_id}", response_model=TimeConstraint)
async def update_constraint(
    constraint_id: str,
    body: ConstraintUpdate,
    user_id: str = Depends(get_current_user_id),
):
    doc = await constraints_repo.find_by_id(constraint_id, id_field="constraint_id")
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Constraint not found")

    merged = {**doc, **body.model_dump(exclude_none=True, mode="json")}
    constraint = TimeConstraint(**merged)
    await constraints_repo.upsert(constraint_id, constraint.model_dump(mode="json"), id_field="constraint_id")
    return constraint


@router.delete("/{constraint_id}")
async def delete_constraint(constraint_id: str, user_id: str = Depends(get_current_user_id)):
    doc = await constraints_repo.find_by_id(constraint_id, id_field="constraint_id")
    if not doc or doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Constraint not found")
    await constraints_repo.delete(constraint_id, id_field="constraint_id")
    return {"deleted": constraint_id}