from pydantic import BaseModel, Field, field_validator, model_validator
from uuid import uuid4


class TimeWindow(BaseModel):
    start_hour: int  # 0-23
    end_hour: int    # 0-23
    days: list[int] = Field(default_factory=lambda: list(range(7)))  # 0=Mon..6=Sun
    duration_min: int | None = None

    @field_validator("start_hour", "end_hour")
    @classmethod
    def validate_hour(cls, value: int) -> int:
        if value < 0 or value > 23:
            raise ValueError("Hours must be between 0 and 23")
        return value

    @field_validator("days")
    @classmethod
    def validate_days(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("At least one day is required")
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("Days must be between 0 (Mon) and 6 (Sun)")
        return sorted(set(value))

    @model_validator(mode="after")
    def validate_window(self):
        if self.start_hour == self.end_hour:
            # Auto-extend end_hour by 1 (e.g., 18→19 for a sub-60min session)
            self.end_hour = min(self.start_hour + 1, 23)
        if self.duration_min is not None and self.duration_min <= 0:
            raise ValueError("Duration must be positive")
        return self


class UserProfile(BaseModel):
    user_id: str = Field(default_factory=lambda: str(uuid4()))
    display_name: str = ""
    email: str = ""
    timezone: str = "UTC"
    daily_capacity_hours: float = 8.0
    max_topics_per_day: int = 2  # max distinct topics scheduled in one day
    preferred_time_windows: list[TimeWindow] = Field(default_factory=list)
    sleep_window: TimeWindow | None = None  # hours when user sleeps
    calendar_id: str | None = None  # Microsoft Graph calendar id

    @field_validator("daily_capacity_hours")
    @classmethod
    def validate_capacity(cls, value: float) -> float:
        if value <= 0 or value > 24:
            raise ValueError("Daily capacity must be between 0 and 24 hours")
        return value

    @field_validator("max_topics_per_day")
    @classmethod
    def validate_max_topics(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Max topics per day must be positive")
        return value
