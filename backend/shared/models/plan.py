from datetime import datetime, timezone
from enum import Enum
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
    topic_id: str
    start_dt: datetime
    duration_min: int
    resources: list[str] = Field(default_factory=list)  # resource ref_ids
    status: BlockStatus = BlockStatus.SCHEDULED
    external_event_id: str | None = None  # calendar event id


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
