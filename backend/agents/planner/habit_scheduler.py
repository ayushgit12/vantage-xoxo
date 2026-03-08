"""Habit Scheduler — creates simple recurring daily blocks for habit-type goals.

For habit goals (gym, pushups, meditation, running), there's no need for:
- Retriever / topic extraction
- Macro allocation
- Complex micro-scheduling

Just create one block per active day at the preferred time.
"""

import logging
from datetime import datetime, date, time, timedelta, timezone

from shared.models.goal import Goal
from shared.models.plan import MicroBlock

logger = logging.getLogger(__name__)


def schedule_habit_blocks(
    goal: Goal,
    window_days: int = 30,
) -> list[MicroBlock]:
    """Create one timed block per active day within window_days.

    Uses goal.preferred_schedule from intake output.
    If missing, applies a safe default schedule.
    """
    today = datetime.now(timezone.utc).date()
    schedule = goal.preferred_schedule

    start_hour = schedule.start_hour if schedule else 7
    end_hour = schedule.end_hour if schedule else 8
    active_days = schedule.days if schedule else list(range(7))
    duration_min = (schedule.duration_min if schedule else 30) or ((end_hour - start_hour) * 60)

    # Cap window at deadline
    deadline_date = goal.deadline.date() if goal.deadline else today + timedelta(days=window_days)
    actual_days = min(window_days, (deadline_date - today).days + 1)

    blocks: list[MicroBlock] = []

    for offset in range(actual_days):
        day = today + timedelta(days=offset)
        # day.weekday() returns 0=Mon..6=Sun matching our convention
        if day.weekday() not in active_days:
            continue

        start_dt = datetime.combine(day, time(start_hour, 0), tzinfo=timezone.utc)

        # For habits, topic_id is the goal_id (there are no extracted topics)
        block = MicroBlock(
            plan_id="",          # set by caller
            goal_id=goal.goal_id,
            topic_id=goal.goal_id,   # synthetic: habits have no real topics
            start_dt=start_dt,
            duration_min=duration_min,
        )
        blocks.append(block)

    logger.info("[HABIT SCHEDULER] Scheduled %d blocks for '%s'", len(blocks), goal.title)
    return blocks
