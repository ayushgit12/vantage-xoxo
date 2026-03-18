from datetime import datetime, time, timezone
from enum import Enum
from pydantic import BaseModel, Field, field_validator, model_validator
from uuid import uuid4


class ConstraintType(str, Enum):
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

    @field_validator("recurring_days")
    @classmethod
    def validate_days(cls, value: list[int]) -> list[int]:
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("Days must be between 0 (Mon) and 6 (Sun)")
        return sorted(set(value))

    @model_validator(mode="after")
    def validate_constraint(self):
        if self.type == ConstraintType.FIXED:
            if not self.start_time or not self.end_time:
                raise ValueError("Fixed constraints require start_time and end_time")
            if self.end_time <= self.start_time:
                raise ValueError("Fixed constraint end_time must be after start_time")
        if self.type == ConstraintType.RECURRING:
            if not self.recurring_days:
                raise ValueError("Recurring constraints require recurring_days")
            if self.recurring_start is None or self.recurring_end is None:
                raise ValueError("Recurring constraints require start and end times")
            if self.recurring_start == self.recurring_end:
                raise ValueError("Recurring constraint start and end cannot match")
        return self
