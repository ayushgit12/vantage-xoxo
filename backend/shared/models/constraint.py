from datetime import datetime, time, timezone
from enum import StrEnum
from pydantic import BaseModel, Field
from uuid import uuid4


class ConstraintType(StrEnum):
    FIXED = "fixed"        # one-time block (e.g., dentist appointment)
    RECURRING = "recurring" # weekly class, gym, etc.
    SOFT = "soft"          # preference, can be overridden


class TimeConstraint(BaseModel):
    constraint_id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    type: ConstraintType
    title: str = ""
    start_time: datetime | None = None       # for fixed
    end_time: datetime | None = None         # for fixed
    recurrence_rule: str | None = None       # iCal RRULE for recurring
    recurring_start: time | None = None      # time of day for recurring
    recurring_end: time | None = None        # time of day for recurring
    recurring_days: list[int] = Field(default_factory=list)  # 0=Mon..6=Sun
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
