import pytest

from api.routers import telemetry as telemetry_router


@pytest.mark.asyncio
async def test_planner_stats_returns_new_metadata_fields(monkeypatch):
    async def fake_find_many(_query_filter, limit=500):
        return [
            {
                "user_id": "u1",
                "micro_blocks": [
                    {"status": "done"},
                    {"status": "missed"},
                ],
                "total_estimated_hours": 5,
                "quality_score": {"overall_score": 80},
                "disruption_index": 0.1,
                "used_fallback": True,
                "retry_triggered": False,
                "ai_recommendation_snapshot": {"confidence": 0.7},
            },
            {
                "user_id": "u1",
                "micro_blocks": [
                    {"status": "partial"},
                    {"status": "scheduled"},
                ],
                "total_estimated_hours": 7,
                "quality_score": {"overall_score": 70},
                "disruption_index": 0.3,
                "used_fallback": False,
                "retry_triggered": True,
                "ai_recommendation_snapshot": {"confidence": 0.9},
            },
        ]

    monkeypatch.setattr(telemetry_router.plans_repo, "find_many", fake_find_many)

    out = await telemetry_router.get_planner_stats(user_id="u1")

    assert out["total_plans"] == 2
    assert out["avg_quality_score"] == 75.0
    assert out["avg_disruption_index"] == 0.2
    assert out["avg_ai_confidence"] == 0.8
    assert out["used_fallback_count"] == 1
    assert out["retry_triggered_count"] == 1
    assert out["ai_confidence_available"] == 2
