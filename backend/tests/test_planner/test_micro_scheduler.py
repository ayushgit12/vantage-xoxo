"""Test micro scheduler."""

from agents.planner.availability import build_availability_matrix
from agents.planner.macro_allocator import compute_macro_allocations
from agents.planner.micro_scheduler import schedule_micro_blocks
from shared.models.user import UserProfile


def test_blocks_within_available_hours(sample_knowledge):
    """All scheduled blocks should fall within available slots."""
    user = UserProfile(user_id="u1")
    matrix = build_availability_matrix(user, constraints=[], window_days=7)
    macro = compute_macro_allocations(sample_knowledge, "2026-06-01T00:00:00", window_days=7)
    blocks = schedule_micro_blocks(
        knowledge=sample_knowledge,
        macro_allocations=macro,
        availability=matrix,
        seed=42,
    )

    for block in blocks:
        # Block should start between 7am and 11pm (outside default sleep)
        assert 7 <= block.start_dt.hour <= 22, f"Block at {block.start_dt} outside waking hours"


def test_no_overlapping_blocks(sample_knowledge):
    """No two blocks should overlap in time."""
    user = UserProfile(user_id="u1")
    matrix = build_availability_matrix(user, constraints=[], window_days=7)
    macro = compute_macro_allocations(sample_knowledge, "2026-06-01T00:00:00", window_days=7)
    blocks = schedule_micro_blocks(
        knowledge=sample_knowledge,
        macro_allocations=macro,
        availability=matrix,
        seed=42,
    )

    from datetime import timedelta
    for i, a in enumerate(blocks):
        a_end = a.start_dt + timedelta(minutes=a.duration_min)
        for b in blocks[i + 1:]:
            b_end = b.start_dt + timedelta(minutes=b.duration_min)
            assert a_end <= b.start_dt or b_end <= a.start_dt, (
                f"Overlap: {a.start_dt}-{a_end} vs {b.start_dt}-{b_end}"
            )
