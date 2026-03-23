from datetime import datetime, timezone

from agents.planner.replan import disruption_index
from shared.models import Plan, MicroBlock


def _block(start_iso: str, duration: int = 60) -> MicroBlock:
    return MicroBlock(
        plan_id="p1",
        goal_id="g1",
        topic_id="t1",
        start_dt=datetime.fromisoformat(start_iso.replace("Z", "+00:00")),
        duration_min=duration,
    )


def test_disruption_index_zero_for_identical_signatures():
    existing = Plan(
        user_id="u1",
        goal_id="g1",
        micro_blocks=[_block("2099-03-24T09:00:00Z", 60)],
    )
    candidate = [_block("2099-03-24T09:00:00Z", 60)]

    idx = disruption_index(existing, candidate)
    assert idx == 0.0


def test_disruption_index_positive_for_changed_schedule():
    existing = Plan(
        user_id="u1",
        goal_id="g1",
        micro_blocks=[_block("2099-03-24T09:00:00Z", 60)],
    )
    candidate = [_block("2099-03-25T11:00:00Z", 60)]

    idx = disruption_index(existing, candidate)
    assert idx > 0.0
