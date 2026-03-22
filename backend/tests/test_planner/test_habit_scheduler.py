from datetime import datetime, timedelta, timezone

from agents.planner.availability import build_availability_matrix
from agents.planner.habit_scheduler import schedule_habit_blocks
from shared.models.goal import Goal, GoalType
from shared.models.user import TimeWindow, UserProfile


def test_habit_schedule_shifts_when_preferred_start_overlaps():
    """Habit block should move when preferred start slot is occupied."""
    user = UserProfile(user_id="u1")
    matrix = build_availability_matrix(user, constraints=[], window_days=1)
    today = datetime.now(timezone.utc).date()

    # Occupy 07:00-08:00 so the habit cannot start at its preferred time.
    matrix.block_slot_range(today, 7, 0, 60)

    goal = Goal(
        user_id="u1",
        title="Morning Workout",
        goal_type=GoalType.HABIT,
        category="fitness",
        deadline=datetime.now(timezone.utc) + timedelta(days=7),
        preferred_schedule=TimeWindow(
            start_hour=7,
            end_hour=8,
            days=[today.weekday()],
            duration_min=60,
        ),
    )

    blocks = schedule_habit_blocks(
        goal=goal,
        window_days=1,
        availability=matrix,
        avoid_overlaps=True,
    )

    assert len(blocks) == 1
    assert blocks[0].start_dt.hour == 8
    assert blocks[0].start_dt.minute == 0
    assert blocks[0].duration_min == 60


def test_habit_schedule_skips_day_when_no_contiguous_slot():
    """No block should be created when the day has no free contiguous duration."""
    user = UserProfile(user_id="u1")
    matrix = build_availability_matrix(user, constraints=[], window_days=1)
    today = datetime.now(timezone.utc).date()

    # Default sleep blocks 23:00-07:00; block all awake hours too.
    matrix.block_slot_range(today, 7, 0, 16 * 60)

    goal = Goal(
        user_id="u1",
        title="Meditation",
        goal_type=GoalType.HABIT,
        category="fitness",
        deadline=datetime.now(timezone.utc) + timedelta(days=7),
        preferred_schedule=TimeWindow(
            start_hour=7,
            end_hour=8,
            days=[today.weekday()],
            duration_min=60,
        ),
    )

    blocks = schedule_habit_blocks(
        goal=goal,
        window_days=1,
        availability=matrix,
        avoid_overlaps=True,
    )

    assert blocks == []
