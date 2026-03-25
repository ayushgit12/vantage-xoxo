from typing import Literal

from pydantic import BaseModel, Field


PlannerAIFallbackReason = Literal[
    "AI_UNAVAILABLE",
    "AI_LOW_CONFIDENCE",
    "AI_INVALID_OUTPUT",
    "AI_TIMEOUT",
]


class PlannerAIInput(BaseModel):
    user_id: str
    window_days: int = 7
    active_goals_count: int = 0
    active_topics_count: int = 0
    recent_done_ratio: float = 0.0
    recent_partial_ratio: float = 0.0
    recent_missed_ratio: float = 0.0
    day_capacity_profile: dict[str, float] = Field(default_factory=dict)
    topic_overrun_factors: dict[str, float] = Field(default_factory=dict)


class PlannerAIRecommendation(BaseModel):
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    daily_capacity_multiplier: float = Field(default=1.0, ge=0.5, le=1.2)
    max_topics_per_day_override: int | None = Field(default=None, ge=1, le=6)
    preferred_block_minutes: int | None = Field(default=None)
    max_disruption_budget: float = Field(default=0.25, ge=0.0, le=0.5)
    urgency_boost_per_goal: dict[str, float] = Field(default_factory=dict)
    notes: str = ""


class PlannerRiskFlags(BaseModel):
    overload_risk: bool = False
    deadline_risk: bool = False
    fragmentation_risk: bool = False
    low_confidence_inputs: bool = False


class PlannerQualityScore(BaseModel):
    overall_score: float = Field(default=0.0, ge=0.0, le=100.0)
    feasibility_score: float = Field(default=0.0, ge=0.0, le=100.0)
    load_balance_score: float = Field(default=0.0, ge=0.0, le=100.0)
    fragmentation_score: float = Field(default=0.0, ge=0.0, le=100.0)
    deadline_risk_score: float = Field(default=0.0, ge=0.0, le=100.0)
    warnings: list[str] = Field(default_factory=list)


class PlannerExplanation(BaseModel):
    summary: str = ""
    tradeoffs: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
