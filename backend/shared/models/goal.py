from datetime import datetime, timezone
from enum import Enum
from pydantic import BaseModel, Field
from uuid import uuid4

from shared.models.user import TimeWindow


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


class GoalType(str, Enum):
    HABIT = "habit"
    LEARNING = "learning"
    PROJECT = "project"


class GoalStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class Goal(BaseModel):
    goal_id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    title: str
    description: str = ""
    goal_type: GoalType = GoalType.LEARNING
    category: GoalCategory = GoalCategory.OTHER
    deadline: datetime
    priority: GoalPriority = GoalPriority.MEDIUM
    status: GoalStatus = GoalStatus.ACTIVE
    target_weekly_effort: float | None = None  # hours per week
    preferred_schedule: TimeWindow | None = None
    restricted_slots: list[TimeWindow] = Field(default_factory=list)
    prefer_user_materials_only: bool = False
    material_urls: list[str] = Field(default_factory=list)
    uploaded_file_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None
    knowledge_id: str | None = None  # set after retriever runs
    active_plan_id: str | None = None  # set after planner runs


class GoalCreate(BaseModel):
    title: str
    description: str = ""
    goal_type: GoalType = GoalType.LEARNING
    category: GoalCategory = GoalCategory.OTHER
    deadline: datetime
    priority: GoalPriority = GoalPriority.MEDIUM
    status: GoalStatus = GoalStatus.ACTIVE
    target_weekly_effort: float | None = None
    preferred_schedule: TimeWindow | None = None
    restricted_slots: list[TimeWindow] = Field(default_factory=list)
    prefer_user_materials_only: bool = False
    material_urls: list[str] = Field(default_factory=list)


class GoalUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    goal_type: GoalType | None = None
    category: GoalCategory | None = None
    deadline: datetime | None = None
    priority: GoalPriority | None = None
    status: GoalStatus | None = None
    target_weekly_effort: float | None = None
    preferred_schedule: TimeWindow | None = None
    restricted_slots: list[TimeWindow] | None = None
    prefer_user_materials_only: bool | None = None
    material_urls: list[str] | None = None
    completed_at: datetime | None = None
