from datetime import datetime

from pydantic import BaseModel, Field

from shared.models.goal import GoalCategory, GoalPriority, GoalType
from shared.models.user import TimeWindow


class ManualGoalOverrides(BaseModel):
    """Optional user-provided fields that override model inference."""

    title: str | None = None
    description: str | None = None
    category: GoalCategory | None = None
    priority: GoalPriority | None = None
    deadline: datetime | None = None
    target_weekly_effort: float | None = None
    preferred_schedule: TimeWindow | None = None
    prefer_user_materials_only: bool | None = None
    material_urls: list[str] | None = None


class ScenarioIntakeRequest(BaseModel):
    """Raw scenario input plus optional manual constraints/overrides."""

    scenario_text: str = Field(min_length=5, max_length=4000)
    overrides: ManualGoalOverrides = Field(default_factory=ManualGoalOverrides)


class ScenarioIntakeResponse(BaseModel):
    """Preview of inferred structure before persisting a goal."""

    scenario_text: str
    inferred_goal_type: GoalType
    confidence: float = Field(ge=0.0, le=1.0)
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    goal_preview: dict
