"""Full workflow integration tests (scenario-driven, in-memory repositories).

Covers major project features in realistic scenarios:
- optional full wipe of real Cosmos DB (opt-in)
- goals lifecycle + multi-user isolation
- retriever ingest + topic review CRUD
- constraints CRUD
- planner generate/replan-all + metadata integrity
- block status transitions including invalid transitions
- user profile update auto-replan trigger
- telemetry planner stats + trace retrieval
"""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import os

import pytest
from fastapi import HTTPException

from api.routers import blocks as blocks_router
from api.routers import constraints as constraints_router
from api.routers import goals as goals_router
from api.routers import plans as plans_router
from api.routers import retriever as retriever_router
from api.routers import telemetry as telemetry_router
from api.routers import users as users_router
from shared.db.cosmos_client import close_database, get_database
from shared.models import (
    AgentLog,
    BlockStatus,
    ConstraintType,
    GoalCreate,
    GoalKnowledge,
    GoalStatus,
    GoalUpdate,
    MicroBlock,
    Milestone,
    Plan,
    TimeWindow,
    Topic,
)


async def _nuke_all_real_db_data() -> list[str]:
    """Delete every container in the configured Cosmos DB database.

    This removes all persisted app data (goals, plans, knowledge, logs, cache, etc.).
    Containers are recreated lazily by the app on next use.
    """
    db = await get_database()
    dropped: list[str] = []
    async for container in db.list_containers():
        container_id = container["id"]
        await db.delete_container(container_id)
        dropped.append(container_id)
    await close_database()
    return dropped


async def _maybe_nuke_real_db() -> None:
    """Opt-in guard for destructive DB purge.

    Set FULL_DB_NUKE=1 to wipe all persisted records before running this test file.
    """
    if os.getenv("FULL_DB_NUKE") == "1":
        await _nuke_all_real_db_data()


class InMemoryRepo:
    def __init__(self, id_field: str):
        self.id_field = id_field
        self.docs: list[dict] = []

    async def clear(self):
        self.docs.clear()

    async def insert(self, doc: dict):
        item = deepcopy(doc)
        if "id" not in item:
            item["id"] = str(item.get(self.id_field, ""))
        self.docs.append(item)
        return item["id"]

    async def find_by_id(self, doc_id: str, id_field: str | None = None):
        field = id_field or self.id_field
        for d in self.docs:
            if d.get(field) == doc_id:
                return deepcopy(d)
        return None

    async def find_many(self, query_filter: dict, limit: int = 100):
        out = []
        for d in self.docs:
            ok = True
            for k, v in query_filter.items():
                if d.get(k) != v:
                    ok = False
                    break
            if ok:
                out.append(deepcopy(d))
                if len(out) >= limit:
                    break
        return out

    async def update(self, doc_id: str, updates: dict, id_field: str | None = None):
        field = id_field or self.id_field
        for d in self.docs:
            if d.get(field) == doc_id:
                d.update(deepcopy(updates))
                return

    async def delete(self, doc_id: str, id_field: str | None = None):
        field = id_field or self.id_field
        self.docs = [d for d in self.docs if d.get(field) != doc_id]

    async def upsert(self, doc_id: str, doc: dict, id_field: str | None = None):
        field = id_field or self.id_field
        for idx, existing in enumerate(self.docs):
            if existing.get(field) == doc_id:
                merged = deepcopy(doc)
                if "id" not in merged:
                    merged["id"] = str(merged.get(field, doc_id))
                self.docs[idx] = merged
                return
        await self.insert(doc)


class IntegrationHarness:
    """Shared wiring for all scenario tests in this module."""

    def __init__(self):
        self.goals_repo = InMemoryRepo("goal_id")
        self.plans_repo = InMemoryRepo("plan_id")
        self.knowledge_repo = InMemoryRepo("goal_id")
        self.constraints_repo = InMemoryRepo("constraint_id")
        self.users_repo = InMemoryRepo("user_id")
        self.logs_repo = InMemoryRepo("trace_id")

        self.replan_calls: list[tuple[str, int]] = []

    async def run_planner(self, goal_id: str, user_id: str, window_days: int = 7):
        idx = sum(ord(ch) for ch in goal_id) % 4
        goal_doc = await self.goals_repo.find_by_id(goal_id)
        title = str((goal_doc or {}).get("title", ""))

        base_score = 70.0 + (idx * 5)
        ai_confidence = 0.55 + (idx * 0.1)
        fallback = idx == 0 or title.endswith("1")
        retry = fallback or idx == 3
        disruption = 0.1 + (idx * 0.05)

        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)

        plan = Plan(
            user_id=user_id,
            goal_id=goal_id,
            plan_window_days=window_days,
            total_estimated_hours=18.0,
            quality_score={"overall_score": base_score},
            risk_flags={"deadline_risk": idx >= 2},
            ai_recommendation_snapshot={"confidence": round(ai_confidence, 3)},
            disruption_index=round(disruption, 4),
            used_fallback=fallback,
            retry_triggered=retry,
        )
        plan.micro_blocks = [
            MicroBlock(
                plan_id=plan.plan_id,
                goal_id=goal_id,
                topic_id=f"{goal_id}-t1",
                start_dt=now + timedelta(days=1, hours=1),
                duration_min=60,
                notes="Foundations",
            ),
            MicroBlock(
                plan_id=plan.plan_id,
                goal_id=goal_id,
                topic_id=f"{goal_id}-t2",
                start_dt=now + timedelta(days=1, hours=3),
                duration_min=60,
                notes="Practice",
            ),
            MicroBlock(
                plan_id=plan.plan_id,
                goal_id=goal_id,
                topic_id=f"{goal_id}-t3",
                start_dt=now + timedelta(days=2, hours=2),
                duration_min=60,
                notes="Review",
            ),
        ]

        await self.plans_repo.upsert(plan.plan_id, plan.model_dump(mode="json"), id_field="plan_id")
        if goal_doc:
            await self.goals_repo.update(
                goal_id,
                {
                    "active_plan_id": plan.plan_id,
                    "status": GoalStatus.ACTIVE.value,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        return plan

    async def replan_all_goals(self, user_id: str, window_days: int = 7):
        self.replan_calls.append((user_id, window_days))
        docs = await self.goals_repo.find_many({"user_id": user_id}, limit=500)
        plans: list[Plan] = []
        for gd in docs:
            if gd.get("status") != GoalStatus.ACTIVE.value:
                continue
            pid = gd.get("active_plan_id")
            if pid:
                pdoc = await self.plans_repo.find_by_id(pid, id_field="plan_id")
                if pdoc:
                    plans.append(Plan(**pdoc))
                    continue
            plans.append(await self.run_planner(gd["goal_id"], user_id, window_days=window_days))
        return plans

    async def run_retriever(self, goal_id: str, user_id: str):
        goal_doc = await self.goals_repo.find_by_id(goal_id)
        if not goal_doc or goal_doc.get("user_id") != user_id:
            raise ValueError("Goal not found")

        t1 = Topic(topic_id=f"{goal_id}-t1", title="Basics", description="Core basics", est_hours=4.0)
        t2 = Topic(
            topic_id=f"{goal_id}-t2",
            title="Intermediate",
            description="Applied concepts",
            est_hours=6.0,
            prereq_ids=[t1.topic_id],
        )
        t3 = Topic(
            topic_id=f"{goal_id}-t3",
            title="Advanced",
            description="Advanced practice",
            est_hours=8.0,
            prereq_ids=[t2.topic_id],
        )
        knowledge = GoalKnowledge(
            goal_id=goal_id,
            topics=[t1, t2, t3],
            milestones=[Milestone(title="Stage 1", topic_ids=[t1.topic_id, t2.topic_id, t3.topic_id])],
            estimated_total_hours=18.0,
            confidence_score=0.84,
        )
        await self.knowledge_repo.upsert(goal_id, knowledge.model_dump(mode="json"), id_field="goal_id")
        await self.goals_repo.update(goal_id, {"knowledge_id": knowledge.knowledge_id})
        return knowledge


async def _clear_db_first(*repos: InMemoryRepo):
    for repo in repos:
        await repo.clear()


@pytest.fixture
async def harness(monkeypatch):
    await _maybe_nuke_real_db()

    h = IntegrationHarness()

    monkeypatch.setattr(goals_router, "goals_repo", h.goals_repo)

    monkeypatch.setattr(plans_router, "goals_repo", h.goals_repo)
    monkeypatch.setattr(plans_router, "plans_repo", h.plans_repo)
    monkeypatch.setattr(plans_router, "run_planner", h.run_planner)
    monkeypatch.setattr(plans_router, "replan_all_goals", h.replan_all_goals)

    monkeypatch.setattr(blocks_router, "plans_repo", h.plans_repo)
    monkeypatch.setattr(blocks_router, "replan_all_goals", h.replan_all_goals)

    monkeypatch.setattr(telemetry_router, "plans_repo", h.plans_repo)
    monkeypatch.setattr(telemetry_router, "logs_repo", h.logs_repo)

    monkeypatch.setattr(retriever_router, "goals_repo", h.goals_repo)
    monkeypatch.setattr(retriever_router, "knowledge_repo", h.knowledge_repo)
    monkeypatch.setattr(retriever_router, "run_retriever", h.run_retriever)

    monkeypatch.setattr(constraints_router, "constraints_repo", h.constraints_repo)

    monkeypatch.setattr(users_router, "users_repo", h.users_repo)
    monkeypatch.setattr(users_router, "replan_all_goals", h.replan_all_goals)

    await _clear_db_first(
        h.goals_repo,
        h.plans_repo,
        h.knowledge_repo,
        h.constraints_repo,
        h.users_repo,
        h.logs_repo,
    )

    return h


@pytest.mark.asyncio
async def test_full_workflow_lifecycle_replan_and_telemetry(harness: IntegrationHarness):
    user_id = "wf-user-001"

    # Create 4 goals and activate all of them.
    created_goal_ids: list[str] = []
    for idx in range(4):
        g = await goals_router.create_goal(
            GoalCreate(
                title=f"Workflow Goal {idx + 1}",
                deadline=datetime.now(timezone.utc) + timedelta(days=45 + idx),
                status=GoalStatus.PAUSED,
            ),
            user_id=user_id,
        )
        created_goal_ids.append(g.goal_id)

    listed = await goals_router.list_goals(user_id=user_id)
    assert len(listed) == 4

    for gid in created_goal_ids:
        updated = await goals_router.update_goal(gid, GoalUpdate(status=GoalStatus.ACTIVE), user_id=user_id)
        assert updated.status == GoalStatus.ACTIVE

    # Run retriever and planner for each goal.
    for gid in created_goal_ids:
        ingest = await retriever_router.trigger_ingest(goal_id=gid, user_id=user_id)
        assert ingest["status"] == "completed"
        assert ingest["topics"] == 3

        payload = await plans_router.generate_plan(goal_id=gid, window=7, user_id=user_id)
        assert payload["status"] == "completed"
        assert "quality_score" in payload

    # Mutate statuses in first goal to exercise no-replan + replan branches.
    first_goal = await harness.goals_repo.find_by_id(created_goal_ids[0])
    assert first_goal is not None
    first_plan = await harness.plans_repo.find_by_id(first_goal["active_plan_id"], id_field="plan_id")
    assert first_plan is not None

    b0 = first_plan["micro_blocks"][0]["block_id"]
    b1 = first_plan["micro_blocks"][1]["block_id"]
    b2 = first_plan["micro_blocks"][2]["block_id"]

    done_resp = await blocks_router.update_block_status(
        b0,
        blocks_router.StatusUpdate(status=BlockStatus.DONE),
        user_id=user_id,
    )
    assert done_resp["replan"] == "none"

    partial_resp = await blocks_router.update_block_status(
        b1,
        blocks_router.StatusUpdate(status=BlockStatus.PARTIAL),
        user_id=user_id,
    )
    assert partial_resp["replan"] == "completed"

    missed_resp = await blocks_router.update_block_status(
        b2,
        blocks_router.StatusUpdate(status=BlockStatus.MISSED),
        user_id=user_id,
    )
    assert missed_resp["replan"] == "completed"

    # Invalid transition: done -> missed should be rejected.
    with pytest.raises(HTTPException) as exc:
        await blocks_router.update_block_status(
            b0,
            blocks_router.StatusUpdate(status=BlockStatus.MISSED),
            user_id=user_id,
        )
    assert exc.value.status_code == 422

    # Replan all aggregate and telemetry metadata.
    replan_payload = await plans_router.replan_all(window=7, user_id=user_id)
    assert replan_payload["status"] == "completed"
    assert replan_payload["goals_planned"] == 4
    assert replan_payload["total_blocks"] >= 12
    assert "avg_quality_score" in replan_payload
    assert "avg_disruption_index" in replan_payload
    assert "fallback_used_count" in replan_payload
    assert "retry_triggered_count" in replan_payload

    stats = await telemetry_router.get_planner_stats(user_id=user_id)
    assert stats["total_plans"] >= 4
    assert stats["done_blocks"] >= 1
    assert stats["partial_blocks"] >= 1
    assert stats["missed_blocks"] >= 1
    assert stats["avg_quality_score"] is not None
    assert stats["avg_disruption_index"] is not None
    assert stats["avg_ai_confidence"] is not None
    assert stats["used_fallback_count"] >= 1
    assert stats["retry_triggered_count"] >= 1


@pytest.mark.asyncio
async def test_retriever_topic_review_and_constraints_crud(harness: IntegrationHarness):
    user_id = "wf-user-review"

    goal = await goals_router.create_goal(
        GoalCreate(
            title="Deep Learning Plan",
            deadline=datetime.now(timezone.utc) + timedelta(days=60),
            status=GoalStatus.ACTIVE,
        ),
        user_id=user_id,
    )

    ingest = await retriever_router.trigger_ingest(goal_id=goal.goal_id, user_id=user_id)
    assert ingest["status"] == "completed"
    assert ingest["estimated_hours"] == 18.0

    knowledge = await retriever_router.get_knowledge(goal_id=goal.goal_id, user_id=user_id)
    assert len(knowledge.topics) == 3

    created = await retriever_router.create_topic_override(
        goal_id=goal.goal_id,
        body=retriever_router.TopicCreateRequest(
            title="Evaluation",
            description="Metrics and validation",
            est_hours=3.5,
            prereq_ids=[knowledge.topics[1].topic_id],
        ),
        user_id=user_id,
    )
    assert len(created.topics) == 4
    assert created.estimated_total_hours == 21.5

    eval_topic = next(t for t in created.topics if t.title == "Evaluation")
    patched = await retriever_router.patch_topic_override(
        goal_id=goal.goal_id,
        topic_id=eval_topic.topic_id,
        body=retriever_router.TopicUpdateRequest(est_hours=4.0),
        user_id=user_id,
    )
    patched_eval = next(t for t in patched.topics if t.topic_id == eval_topic.topic_id)
    assert patched_eval.est_hours == 4.0
    assert patched.estimated_total_hours == 22.0

    removed = await retriever_router.remove_topic_override(
        goal_id=goal.goal_id,
        topic_id=eval_topic.topic_id,
        user_id=user_id,
    )
    assert all(t.topic_id != eval_topic.topic_id for t in removed.topics)
    assert removed.estimated_total_hours == 18.0

    c1 = await constraints_router.create_constraint(
        body=constraints_router.ConstraintCreate(
            type=ConstraintType.FIXED,
            title="Doctor appointment",
            start_time=datetime.now(timezone.utc) + timedelta(days=1),
            end_time=datetime.now(timezone.utc) + timedelta(days=1, hours=1),
        ),
        user_id=user_id,
    )
    assert c1.user_id == user_id

    listed = await constraints_router.list_constraints(user_id=user_id)
    assert len(listed) == 1

    updated = await constraints_router.update_constraint(
        c1.constraint_id,
        body=constraints_router.ConstraintUpdate(title="Dentist appointment"),
        user_id=user_id,
    )
    assert updated.title == "Dentist appointment"

    deleted = await constraints_router.delete_constraint(c1.constraint_id, user_id=user_id)
    assert deleted["deleted"] == c1.constraint_id
    assert await constraints_router.list_constraints(user_id=user_id) == []


@pytest.mark.asyncio
async def test_multi_user_isolation_and_profile_replan(harness: IntegrationHarness):
    user_a = "wf-user-a"
    user_b = "wf-user-b"

    goal_a = await goals_router.create_goal(
        GoalCreate(
            title="User A Goal",
            deadline=datetime.now(timezone.utc) + timedelta(days=30),
            status=GoalStatus.ACTIVE,
        ),
        user_id=user_a,
    )
    goal_b = await goals_router.create_goal(
        GoalCreate(
            title="User B Goal",
            deadline=datetime.now(timezone.utc) + timedelta(days=30),
            status=GoalStatus.ACTIVE,
        ),
        user_id=user_b,
    )

    goals_a = await goals_router.list_goals(user_id=user_a)
    goals_b = await goals_router.list_goals(user_id=user_b)
    assert len(goals_a) == 1
    assert len(goals_b) == 1

    with pytest.raises(HTTPException) as exc:
        await goals_router.get_goal(goal_a.goal_id, user_id=user_b)
    assert exc.value.status_code == 404

    await plans_router.generate_plan(goal_id=goal_a.goal_id, window=7, user_id=user_a)
    await plans_router.generate_plan(goal_id=goal_b.goal_id, window=7, user_id=user_b)

    profile_a = await users_router.update_profile(
        users_router.UserProfileUpdate(
            daily_capacity_hours=6.0,
            max_topics_per_day=2,
            sleep_window=TimeWindow(start_hour=23, end_hour=7),
        ),
        user_id=user_a,
    )
    assert profile_a.daily_capacity_hours == 6.0

    assert any(uid == user_a for uid, _ in harness.replan_calls)

    profile_b = await users_router.get_profile(user_id=user_b)
    assert profile_b.user_id == user_b


@pytest.mark.asyncio
async def test_telemetry_trace_and_metadata_integrity(harness: IntegrationHarness):
    user_id = "wf-user-trace"

    goal = await goals_router.create_goal(
        GoalCreate(
            title="Telemetry Goal",
            deadline=datetime.now(timezone.utc) + timedelta(days=21),
            status=GoalStatus.ACTIVE,
        ),
        user_id=user_id,
    )
    await plans_router.generate_plan(goal_id=goal.goal_id, window=7, user_id=user_id)

    trace_id = "trace-integration-001"
    await harness.logs_repo.insert(
        AgentLog(agent_name="retriever", trace_id=trace_id, decision_summary="ingest ok", duration_ms=120)
        .model_dump(mode="json")
    )
    await harness.logs_repo.insert(
        AgentLog(agent_name="planner", trace_id=trace_id, decision_summary="plan ok", duration_ms=95)
        .model_dump(mode="json")
    )

    trace = await telemetry_router.get_trace(trace_id=trace_id)
    assert trace["trace_id"] == trace_id
    assert len(trace["entries"]) == 2

    stats = await telemetry_router.get_planner_stats(user_id=user_id)
    assert stats["user_id"] == user_id
    assert stats["total_plans"] >= 1
    assert stats["total_blocks"] >= 1
    assert stats["quality_score_available"] >= 1
    assert stats["disruption_index_available"] >= 1
    assert stats["ai_confidence_available"] >= 1


if __name__ == "__main__":
    asyncio.run(_nuke_all_real_db_data())
