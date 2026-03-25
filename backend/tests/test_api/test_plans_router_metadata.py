import pytest

from api.routers import plans as plans_router
from shared.models import Plan


@pytest.mark.asyncio
async def test_generate_plan_returns_metadata(monkeypatch):
    async def fake_find_goal(goal_id):
        return {"goal_id": goal_id, "user_id": "u1"}

    async def fake_run_planner(goal_id, user_id, window_days=7):
        return Plan(
            user_id=user_id,
            goal_id=goal_id,
            quality_score={"overall_score": 77.0},
            risk_flags={"deadline_risk": False},
            disruption_index=0.11,
            used_fallback=False,
            retry_triggered=True,
        )

    monkeypatch.setattr(plans_router.goals_repo, "find_by_id", fake_find_goal)
    monkeypatch.setattr(plans_router, "run_planner", fake_run_planner)

    payload = await plans_router.generate_plan(goal_id="g1", window=7, user_id="u1")

    assert payload["status"] == "completed"
    assert payload["quality_score"]["overall_score"] == 77.0
    assert payload["risk_flags"]["deadline_risk"] is False
    assert payload["disruption_index"] == 0.11
    assert payload["retry_triggered"] is True


@pytest.mark.asyncio
async def test_replan_all_returns_aggregate_metadata(monkeypatch):
    async def fake_replan(user_id, window_days=7):
        return [
            Plan(
                user_id=user_id,
                goal_id="g1",
                quality_score={"overall_score": 80.0},
                disruption_index=0.10,
                used_fallback=True,
                retry_triggered=False,
            ),
            Plan(
                user_id=user_id,
                goal_id="g2",
                quality_score={"overall_score": 70.0},
                disruption_index=0.20,
                used_fallback=False,
                retry_triggered=True,
            ),
        ]

    monkeypatch.setattr(plans_router, "replan_all_goals", fake_replan)

    payload = await plans_router.replan_all(window=7, user_id="u1")

    assert payload["status"] == "completed"
    assert payload["avg_quality_score"] == 75.0
    assert payload["avg_disruption_index"] == 0.15
    assert payload["fallback_used_count"] == 1
    assert payload["retry_triggered_count"] == 1
