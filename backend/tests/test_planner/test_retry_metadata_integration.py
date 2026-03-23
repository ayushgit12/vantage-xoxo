from datetime import datetime, timezone

from agents.planner.quality_scorer import compute_quality_score
from shared.models import Plan, MicroBlock


def _block(start_iso: str, duration: int = 60) -> MicroBlock:
    return MicroBlock(
        plan_id="p1",
        goal_id="g1",
        topic_id="t1",
        start_dt=datetime.fromisoformat(start_iso.replace("Z", "+00:00")),
        duration_min=duration,
    )


def test_quality_gate_retry_candidate_example_not_worse():
    """Conservative retry candidate should not improve overlap risk by getting worse."""
    primary = Plan(
        user_id="u1",
        goal_id="g1",
        micro_blocks=[
            _block("2099-03-24T09:00:00Z", 120),
            _block("2099-03-24T09:30:00Z", 60),
        ],
    )

    conservative = Plan(
        user_id="u1",
        goal_id="g1",
        micro_blocks=[
            _block("2099-03-24T09:00:00Z", 30),
            _block("2099-03-24T10:00:00Z", 30),
        ],
    )

    primary_score = compute_quality_score(primary)
    conservative_score = compute_quality_score(conservative)

    assert conservative_score.feasibility_score >= primary_score.feasibility_score
