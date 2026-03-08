from datetime import datetime, timezone
from enum import Enum
from pydantic import BaseModel, Field
from uuid import uuid4


class GoalCategory(str, Enum):
    COURSE = "course"
    PROJECT = "project"
    SKILL = "skill"
    HOBBY = "hobby"
    FITNESS = "fitness"
    INTERNSHIP = "internship"
    OTHER = "other"


class GoalPriority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Goal(BaseModel):
    goal_id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    title: str
    category: GoalCategory = GoalCategory.OTHER
    deadline: datetime
    priority: GoalPriority = GoalPriority.MEDIUM
    target_weekly_effort: float | None = None  # hours per week
    prefer_user_materials_only: bool = False
    material_urls: list[str] = Field(default_factory=list)
    uploaded_file_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    knowledge_id: str | None = None  # set after retriever runs
    active_plan_id: str | None = None  # set after planner runs


class GoalCreate(BaseModel):
    title: str
    category: GoalCategory = GoalCategory.OTHER
    deadline: datetime
    priority: GoalPriority = GoalPriority.MEDIUM
    target_weekly_effort: float | None = None
    prefer_user_materials_only: bool = False
    material_urls: list[str] = Field(default_factory=list)


class GoalUpdate(BaseModel):
    title: str | None = None
    category: GoalCategory | None = None
    deadline: datetime | None = None
    priority: GoalPriority | None = None
    target_weekly_effort: float | None = None
    prefer_user_materials_only: bool | None = None
    material_urls: list[str] | None = None
