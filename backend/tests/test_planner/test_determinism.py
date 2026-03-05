"""Test determinism: same inputs → same plan."""

from agents.planner.availability import build_availability_matrix
from agents.planner.macro_allocator import compute_macro_allocations
from agents.planner.micro_scheduler import schedule_micro_blocks
from shared.models.user import UserProfile


def test_deterministic_scheduling(sample_knowledge):
    """Run the scheduler twice with same inputs; verify identical output."""
    user = UserProfile(user_id="u1")
    deadline = "2026-06-01T00:00:00"

    results = []
    for _ in range(3):
        matrix = build_availability_matrix(user, constraints=[], window_days=7)
        macro = compute_macro_allocations(sample_knowledge, deadline, window_days=7)
        blocks = schedule_micro_blocks(
            knowledge=sample_knowledge,
            macro_allocations=macro,
            availability=matrix,
            seed=42,
        )
        results.append(blocks)

    # All runs should produce identical block lists
    for i in range(1, len(results)):
        assert len(results[i]) == len(results[0])
        for a, b in zip(results[0], results[i]):
            assert a.topic_id == b.topic_id
            assert a.start_dt == b.start_dt
            assert a.duration_min == b.duration_min
