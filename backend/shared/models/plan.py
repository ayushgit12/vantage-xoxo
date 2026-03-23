from datetime import datetime, timezone
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field
from uuid import uuid4


class BlockStatus(str, Enum):
    SCHEDULED = "scheduled"
    DONE = "done"
    PARTIAL = "partial"
    MISSED = "missed"
    CANCELLED = "cancelled"


class MicroBlock(BaseModel):
    block_id: str = Field(default_factory=lambda: str(uuid4()))
    plan_id: str
    goal_id: str
    # For learning goals: a real Topic.topic_id from GoalKnowledge.
    # For habit goals: the goal_id is used as a sentinel (no extracted topics).
    topic_id: str
    start_dt: datetime
    duration_min: int
    resources: list[str] = Field(default_factory=list)  # resource ref_ids
    status: BlockStatus = BlockStatus.SCHEDULED
    external_event_id: str | None = None  # calendar event id
    # Human-readable label — populated by habit scheduler; falls back to topic title for learning goals.
    notes: str = ""


class MacroAllocation(BaseModel):
    goal_id: str
    topic_id: str
    week_start: datetime
    allocated_hours: float


class Plan(BaseModel):
    plan_id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    goal_id: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    plan_window_days: int = 7
    seed: int = 42  # for deterministic scheduling
    macro_allocations: list[MacroAllocation] = Field(default_factory=list)
    micro_blocks: list[MicroBlock] = Field(default_factory=list)
    explanation: str = ""
    version: int = 1
    # Copied from GoalKnowledge at plan-creation time so clients can compute
    # meaningful progress without a separate knowledge fetch.
    # Progress = sum(done_block.duration_min) / (total_estimated_hours * 60)
    total_estimated_hours: float = 0.0
    # AI/quality metadata — optional for backward compatibility.
    quality_score: dict[str, Any] | None = None
    risk_flags: dict[str, bool] | None = None
    ai_recommendation_snapshot: dict[str, Any] | None = None
    fallback_reason: str | None = None
    disruption_index: float | None = None
    used_fallback: bool = False
    retry_triggered: bool = False
