"""Live Ryuk chatbot functionality tests using real workflow context."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app
from shared.db.cosmos_client import close_database
from tests.validation.workflow_quality_checks import (
    assert_ryuk_response_quality,
    ensure_live_runtime_config,
)


def _log_step(message: str) -> None:
    print(f"[ryuk-e2e] {message}", flush=True)


@pytest.mark.asyncio
async def test_ryuk_live_scenarios() -> None:
    ensure_live_runtime_config()
    # Ensure Cosmos async client is recreated in this test's event loop.
    await close_database()

    user_id = f"ryuk-live-{uuid4().hex[:8]}"
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
        headers={"X-User-Id": user_id},
        timeout=120.0,
    ) as client:
        _log_step("creating goal for Ryuk context")
        create = await client.post(
            "/api/goals",
            json={
                "title": "Ryuk Context Goal",
                "description": "Goal used for live chatbot validation",
                "goal_type": "learning",
                "category": "course",
                "priority": "medium",
                "status": "active",
                "deadline": (datetime.now(timezone.utc) + timedelta(days=21)).isoformat(),
                "material_urls": [],
                "prefer_user_materials_only": True,
            },
        )
        assert create.status_code == 200, create.text
        goal_id = create.json()["goal_id"]
        _log_step(f"goal created id={goal_id}")

        _log_step("running retriever ingest")
        ingest = await client.post("/api/retriever/ingest", params={"goal_id": goal_id})
        assert ingest.status_code == 200, ingest.text

        _log_step("running planner generate")
        plan = await client.post("/api/plans/generate", params={"goal_id": goal_id, "window": 7})
        assert plan.status_code == 200, plan.text

        _log_step("sending chat message to Ryuk")
        chat = await client.post(
            "/api/chat/message",
            json={
                "message": "What is my current goal and what study blocks are scheduled next?",
                "history": [],
            },
        )
        assert chat.status_code == 200, chat.text

        assert_ryuk_response_quality(
            chat.text,
            expected_keywords=["goal", "scheduled", "study", "ryuk context goal"],
        )
        _log_step("Ryuk response validated (data kept)")

    # Run empty-context behavior in the same event loop to avoid async client
    # reuse issues between separate test coroutines.
    empty_user_id = f"ryuk-empty-{uuid4().hex[:8]}"
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
        headers={"X-User-Id": empty_user_id},
        timeout=60.0,
    ) as client:
        _log_step("sending Ryuk message for empty-context user")
        chat = await client.post(
            "/api/chat/message",
            json={"message": "What should I do today?", "history": []},
        )
        assert chat.status_code == 200, chat.text
        assert "create a goal" in chat.text.lower()
        _log_step("empty-context behavior validated")
    await close_database()
