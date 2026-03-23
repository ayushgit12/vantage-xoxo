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


def test_quality_score_with_balanced_plan_is_high():
    plan = Plan(
        user_id="u1",
        goal_id="g1",
        micro_blocks=[
            _block("2026-03-24T09:00:00Z", 60),
            _block("2026-03-25T09:00:00Z", 60),
            _block("2026-03-26T09:00:00Z", 60),
        ],
    )

    score = compute_quality_score(plan, deadline="2026-04-10T00:00:00Z")

    assert score.overall_score >= 70
    assert score.feasibility_score >= 99


def test_quality_score_with_overlap_penalizes_feasibility():
    plan = Plan(
        user_id="u1",
        goal_id="g1",
        micro_blocks=[
            _block("2026-03-24T09:00:00Z", 90),
            _block("2026-03-24T09:30:00Z", 60),
        ],
    )

    score = compute_quality_score(plan, deadline=datetime(2026, 4, 10, tzinfo=timezone.utc))

    assert score.feasibility_score < 100
    assert len(score.warnings) >= 1
