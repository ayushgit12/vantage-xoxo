"""User profile endpoints for planner personalization."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.dependencies import get_current_user_id
from shared.db.repositories import users_repo
from shared.models import TimeWindow, UserProfile

router = APIRouter()


class UserProfileUpdate(BaseModel):
    display_name: str = ""
    email: str = ""
    timezone: str = "UTC"
    daily_capacity_hours: float = 8.0
    max_topics_per_day: int = 2
    preferred_time_windows: list[TimeWindow] = Field(default_factory=list)
    sleep_window: TimeWindow | None = None
    calendar_id: str | None = None


async def _get_or_create_profile(user_id: str) -> UserProfile:
    doc = await users_repo.find_by_id(user_id, id_field="user_id")
    if doc:
        return UserProfile(**doc)

    profile = UserProfile(user_id=user_id)
    await users_repo.upsert(user_id, profile.model_dump(mode="json"), id_field="user_id")
    return profile


@router.get("/profile", response_model=UserProfile)
async def get_profile(user_id: str = Depends(get_current_user_id)):
    return await _get_or_create_profile(user_id)


@router.put("/profile", response_model=UserProfile)
async def update_profile(body: UserProfileUpdate, user_id: str = Depends(get_current_user_id)):
    current = await _get_or_create_profile(user_id)
    updates = body.model_dump(mode="json")
    base = current.model_dump(mode="json")
    base.update(updates)
    base["user_id"] = user_id
    profile = UserProfile(**base)
    await users_repo.upsert(user_id, profile.model_dump(mode="json"), id_field="user_id")
    return profile