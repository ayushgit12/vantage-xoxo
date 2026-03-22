"""Test availability matrix construction."""

from datetime import date, datetime, time, timedelta, timezone
from shared.models.user import UserProfile, TimeWindow
from agents.planner.availability import build_availability_matrix


def test_default_sleep_blocked():
    user = UserProfile(user_id="u1")
    matrix = build_availability_matrix(user, constraints=[], window_days=1)
    slots = matrix.get_available_slots()
    # Sleep 11pm-7am blocked → 7am-11pm available = 16 hours = 32 slots
    hours_available = [s.hour for s in slots]
    assert all(7 <= h <= 22 for h in hours_available)


def test_recurring_constraint_blocked():
    user = UserProfile(user_id="u1")
    constraints = [
        {
            "type": "recurring",
            "recurring_days": [0, 2, 4],  # Mon, Wed, Fri
            "recurring_start": 9,
            "recurring_end": 11,
        }
    ]
    matrix = build_availability_matrix(user, constraints=constraints, window_days=7)
    # Check Monday 9am is blocked
    monday = matrix.start_date
    while monday.weekday() != 0:
        from datetime import timedelta
        monday += timedelta(days=1)

    monday_slots = matrix.get_available_slots(monday)
    hours = {s.hour for s in monday_slots}
    assert 9 not in hours
    assert 10 not in hours


def test_contiguous_blocks():
    user = UserProfile(user_id="u1")
    matrix = build_availability_matrix(user, constraints=[], window_days=1)
    blocks = matrix.get_contiguous_blocks(min_slots=2)
    assert len(blocks) > 0
    # Each block should have at least 2 contiguous slots
    for block in blocks:
        assert len(block) >= 2


def test_fixed_constraint_blocked_with_minute_precision():
    user = UserProfile(user_id="u1")
    start_day = datetime.now(timezone.utc).date()
    start_dt = datetime.combine(start_day, time(9, 30), tzinfo=timezone.utc)
    end_dt = start_dt + timedelta(hours=1)

    constraints = [
        {
            "type": "fixed",
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
        }
    ]

    matrix = build_availability_matrix(user, constraints=constraints, window_days=1)

    slot_900 = next(s for s in matrix.slots if s.date == start_day and s.hour == 9 and s.minute == 0)
    slot_930 = next(s for s in matrix.slots if s.date == start_day and s.hour == 9 and s.minute == 30)
    slot_1000 = next(s for s in matrix.slots if s.date == start_day and s.hour == 10 and s.minute == 0)
    slot_1030 = next(s for s in matrix.slots if s.date == start_day and s.hour == 10 and s.minute == 30)

    assert slot_900.available is True
    assert slot_930.available is False
    assert slot_1000.available is False
    assert slot_1030.available is True


def test_preferred_windows_are_enforced():
    user = UserProfile(
        user_id="u1",
        preferred_time_windows=[
            TimeWindow(start_hour=10, end_hour=12, days=list(range(7))),
        ],
    )
    matrix = build_availability_matrix(user, constraints=[], window_days=1)
    slots = matrix.get_available_slots()
    hours_available = {s.hour for s in slots}

    assert hours_available == {10, 11}
