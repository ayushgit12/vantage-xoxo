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
    window_days: int = 7,
) -> list[MicroBlock]:
    """Create one timed block per active day within window_days.

    Uses goal.preferred_schedule from intake output.
    If missing, applies a safe default schedule.

    Note: window_days is respected exactly — no forced minimum — so that habit
    plans stay consistent with the shared 7-day scheduling window used for all
    other goal types.
    """
    today = datetime.now(timezone.utc).date()
    schedule = goal.preferred_schedule

    start_hour = schedule.start_hour if schedule else 7
    end_hour = schedule.end_hour if schedule else 8
    active_days = schedule.days if schedule else list(range(7))
    duration_min = (schedule.duration_min if schedule else None) or ((end_hour - start_hour) * 60)

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

        block = MicroBlock(
            plan_id="",          # set by caller
            goal_id=goal.goal_id,
            # topic_id uses goal_id as a sentinel — habit goals have no extracted topics.
            topic_id=goal.goal_id,
            start_dt=start_dt,
            duration_min=duration_min,
            # Store the goal title in notes so the frontend has a human-readable
            # label without needing GoalKnowledge (which does not exist for habits).
            notes=goal.title,
        )
        blocks.append(block)

    logger.info("[HABIT SCHEDULER] Scheduled %d blocks for '%s' (%d-day window)", len(blocks), goal.title, window_days)
    return blocks
