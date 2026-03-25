from datetime import datetime, timezone
import asyncio

from agents.planner.calibration import summarize_user_execution_patterns


def test_summarize_user_execution_patterns(monkeypatch):
    async def fake_find_many(_query_filter, limit=300):
        assert limit == 300
        return [
            {
                "micro_blocks": [
                    {
                        "topic_id": "t1",
                        "status": "done",
                        "duration_min": 60,
                        "start_dt": datetime(2026, 3, 23, 9, tzinfo=timezone.utc).isoformat(),
                    },
                    {
                        "topic_id": "t1",
                        "status": "missed",
                        "duration_min": 60,
                        "start_dt": datetime(2026, 3, 24, 9, tzinfo=timezone.utc).isoformat(),
                    },
                    {
                        "topic_id": "t2",
                        "status": "partial",
                        "duration_min": 60,
                        "start_dt": datetime(2026, 3, 25, 9, tzinfo=timezone.utc).isoformat(),
                    },
                ]
            }
        ]

    from agents.planner import calibration as mod

    monkeypatch.setattr(mod.plans_repo, "find_many", fake_find_many)

    summary = asyncio.run(summarize_user_execution_patterns("u1"))

    assert summary["sample_size_blocks"] == 3
    assert summary["sample_size_plans"] == 1
    assert abs(summary["recent_done_ratio"] - (1 / 3)) < 1e-3
    assert abs(summary["recent_partial_ratio"] - (1 / 3)) < 1e-3
    assert abs(summary["recent_missed_ratio"] - (1 / 3)) < 1e-3
    assert "day_capacity_profile" in summary
    assert "topic_overrun_factors" in summary
    assert summary["topic_overrun_factors"]["t1"] >= 1.0
