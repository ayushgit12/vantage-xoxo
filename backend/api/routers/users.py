"""User profile endpoints for planner personalization."""

import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.dependencies import get_current_user_id
from shared.db.repositories import users_repo
from shared.models import TimeWindow, UserProfile
from agents.planner.agent import replan_all_goals

logger = logging.getLogger(__name__)

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

    # Trigger automatic replan if critical scheduling settings changed.
    # This ensures sleep_window and preferred_time_windows changes take effect immediately.
    settings_changed = (
        body.sleep_window != current.sleep_window
        or body.preferred_time_windows != current.preferred_time_windows
        or body.daily_capacity_hours != current.daily_capacity_hours
        or body.max_topics_per_day != current.max_topics_per_day
    )
    if settings_changed:
        try:
            logger.info(
                "User profile settings changed for %s; triggering global replan",
                user_id,
            )
            await replan_all_goals(user_id, window_days=7)
            logger.info("Replan completed for user %s", user_id)
        except Exception as e:
            logger.error("Replan failed after profile update: %s", e, exc_info=True)
            # Do not fail the profile update if replan fails; user can manually replan.

    return profile