"""Test availability matrix construction."""

from datetime import date
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
