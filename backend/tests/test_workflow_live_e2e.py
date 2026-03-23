"""Live end-to-end workflow validation against real DB + real LLM path.

This suite intentionally avoids monkeypatching planner/retriever execution.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app
from shared.db.cosmos_client import close_database
from tests.validation.workflow_quality_checks import (
    assert_knowledge_quality,
    assert_plan_quality,
    assert_telemetry_quality,
    ensure_live_runtime_config,
)


def _log_step(message: str) -> None:
    print(f"[live-e2e] {message}", flush=True)


async def _create_goal(client: AsyncClient, title: str, deadline_days: int) -> str:
    _log_step(f"creating goal title='{title}' deadline_days={deadline_days}")
    payload = {
        "title": title,
        "description": f"Live validation goal: {title}",
        "goal_type": "learning",
        "category": "course",
        "priority": "medium",
        "status": "active",
        "deadline": (datetime.now(timezone.utc) + timedelta(days=deadline_days)).isoformat(),
        "material_urls": [],
        "prefer_user_materials_only": True,
    }
    r = await client.post("/api/goals", json=payload)
    assert r.status_code == 200, r.text
    _log_step(f"goal created id={r.json()['goal_id']}")
    return r.json()["goal_id"]


async def _run_live_scenario(goal_count: int) -> None:
    ensure_live_runtime_config()
    # Reset cached async Cosmos client so this scenario always runs in the
    # current event loop.
    await close_database()

    user_id = f"live-e2e-{goal_count}-{uuid4().hex[:8]}"
    goal_ids: list[str] = []
    _log_step(f"scenario start goal_count={goal_count} user_id={user_id}")

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
        headers={"X-User-Id": user_id},
        timeout=120.0,
    ) as client:
        # Create goals for this scenario.
        for i in range(goal_count):
            gid = await _create_goal(
                client,
                title=f"Live Scenario Goal {goal_count}-{i + 1}",
                deadline_days=30 + i,
            )
            goal_ids.append(gid)

        listed = await client.get("/api/goals")
        assert listed.status_code == 200, listed.text
        assert len(listed.json()) == goal_count
        _log_step(f"list goals verified count={goal_count}")

        for gid in goal_ids:
            _log_step(f"ingest start goal_id={gid}")
            ingest = await client.post("/api/retriever/ingest", params={"goal_id": gid})
            assert ingest.status_code == 200, ingest.text
            assert ingest.json().get("status") == "completed"
            _log_step(f"ingest completed goal_id={gid}")

            k = await client.get(f"/api/retriever/knowledge/{gid}")
            assert k.status_code == 200, k.text
            assert_knowledge_quality(k.json(), min_topics=2)
            _log_step(f"knowledge quality validated goal_id={gid}")

            _log_step(f"plan generation start goal_id={gid}")
            gen = await client.post("/api/plans/generate", params={"goal_id": gid, "window": 7})
            assert gen.status_code == 200, gen.text
            assert_plan_quality(gen.json())
            _log_step(f"plan generation validated goal_id={gid}")

        # Update statuses on first goal's plan blocks.
        first_goal_plan = await client.get(f"/api/plans/goal/{goal_ids[0]}")
        assert first_goal_plan.status_code == 200, first_goal_plan.text
        blocks = first_goal_plan.json().get("micro_blocks", [])
        assert len(blocks) >= 3

        b0 = blocks[0]["block_id"]
        b1 = blocks[1]["block_id"]
        b2 = blocks[2]["block_id"]

        r_done = await client.post(f"/api/blocks/{b0}/status", json={"status": "done"})
        assert r_done.status_code == 200, r_done.text
        _log_step("block status updated: done")

        r_partial = await client.post(f"/api/blocks/{b1}/status", json={"status": "partial"})
        assert r_partial.status_code == 200, r_partial.text
        _log_step("block status updated: partial")

        r_missed = await client.post(f"/api/blocks/{b2}/status", json={"status": "missed"})
        assert r_missed.status_code == 200, r_missed.text
        _log_step("block status updated: missed")

        # Global replan and telemetry checks.
        replan = await client.post("/api/plans/replan-all", params={"window": 7})
        assert replan.status_code == 200, replan.text
        assert replan.json().get("goals_planned", 0) >= goal_count
        _log_step("global replan validated")

        stats = await client.get("/api/telemetry/planner/stats")
        assert stats.status_code == 200, stats.text
        assert_telemetry_quality(stats.json(), min_plans=goal_count)
        _log_step("telemetry quality validated")
        _log_step(f"scenario finished goal_count={goal_count} (data kept)")
    await close_database()


@pytest.mark.asyncio
async def test_live_workflow_scenarios_two_and_three_goals() -> None:
    # Run multi-goal scenarios to observe interaction behavior and global replans.
    await _run_live_scenario(goal_count=2)
    await _run_live_scenario(goal_count=3)
