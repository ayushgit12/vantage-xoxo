from pydantic import BaseModel, Field
from uuid import uuid4


class TimeWindow(BaseModel):
    start_hour: int  # 0-23
    end_hour: int    # 0-23
    days: list[int] = Field(default_factory=lambda: list(range(7)))  # 0=Mon..6=Sun


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
