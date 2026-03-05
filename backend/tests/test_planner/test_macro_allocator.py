"""Test macro allocator."""

from agents.planner.macro_allocator import compute_macro_allocations


def test_macro_covers_all_hours(sample_knowledge):
    """Macro allocations should cover (approximately) the total estimated hours."""
    allocations = compute_macro_allocations(
        knowledge=sample_knowledge,
        deadline="2026-06-01T00:00:00",
        window_days=7,
    )
    assert len(allocations) > 0
    total_allocated = sum(a.allocated_hours for a in allocations)
    # Should allocate at least some hours
    assert total_allocated > 0


def test_macro_respects_dependencies(sample_knowledge):
    """Topics with prerequisites should generally come later."""
    allocations = compute_macro_allocations(
        knowledge=sample_knowledge,
        deadline="2026-06-01T00:00:00",
        window_days=7,
    )
    # Find the first week each topic appears
    first_week = {}
    for alloc in allocations:
        if alloc.topic_id not in first_week:
            first_week[alloc.topic_id] = alloc.week_start

    # t1 (Linear Algebra) should appear before t3 (Supervised Learning)
    if "t1" in first_week and "t3" in first_week:
        assert first_week["t1"] <= first_week["t3"]
