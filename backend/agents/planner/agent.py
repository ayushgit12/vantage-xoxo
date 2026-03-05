"""Planner Agent — macro allocation + deterministic micro scheduling.

NO LLM in the core scheduling loop.
Everything is rule-driven with seeded tie-breakers.
"""

import logging
import time
from uuid import uuid4

from shared.config import get_settings
from shared.models import Plan, GoalKnowledge, AgentLog
from shared.models.user import UserProfile
from shared.db.repositories import (
    goals_repo, knowledge_repo, plans_repo, users_repo,
    constraints_repo, logs_repo,
)
from shared.bus.service_bus import send_message
from shared.telemetry.tracing import get_tracer

from agents.planner.availability import build_availability_matrix
from agents.planner.macro_allocator import compute_macro_allocations
from agents.planner.micro_scheduler import schedule_micro_blocks

logger = logging.getLogger(__name__)
tracer = get_tracer("planner")

DEFAULT_SEED = 42


async def run_planner(
    goal_id: str,
    user_id: str,
    window_days: int = 7,
    replan: bool = False,
    trigger_block_id: str | None = None,
) -> Plan:
    """Full planner pipeline."""
    trace_id = str(uuid4())
    t0 = time.monotonic()

    with tracer.start_as_current_span("planner.run", attributes={"goal_id": goal_id}):
        # 1. Load knowledge
        knowledge_doc = await knowledge_repo.find_by_id(goal_id, id_field="goal_id")
        if not knowledge_doc:
            raise ValueError(f"No GoalKnowledge for goal {goal_id}")
        knowledge = GoalKnowledge(**knowledge_doc)

        # 2. Load goal
        goal_doc = await goals_repo.find_by_id(goal_id)
        if not goal_doc:
            raise ValueError(f"Goal {goal_id} not found")

        # 3. Load user profile (or defaults)
        user_doc = await users_repo.find_by_id(user_id, id_field="user_id")
        if user_doc:
            user = UserProfile(**user_doc)
        else:
            user = UserProfile(user_id=user_id)

        # 4. Load time constraints
        constraint_docs = await constraints_repo.find_many({"user_id": user_id})

        # 5. Build availability matrix
        availability = build_availability_matrix(
            user=user,
            constraints=constraint_docs,
            window_days=window_days,
        )

        # 6. Compute macro allocations
        macro = compute_macro_allocations(
            knowledge=knowledge,
            deadline=goal_doc["deadline"],
            target_weekly_effort=goal_doc.get("target_weekly_effort"),
            window_days=window_days,
        )

        # 7. Schedule micro blocks (deterministic)
        micro_blocks = schedule_micro_blocks(
            knowledge=knowledge,
            macro_allocations=macro,
            availability=availability,
            seed=DEFAULT_SEED,
        )

        # 8. Build plan
        plan = Plan(
            user_id=user_id,
            goal_id=goal_id,
            plan_window_days=window_days,
            seed=DEFAULT_SEED,
            macro_allocations=macro,
            micro_blocks=micro_blocks,
            version=1,
        )

        # 9. Persist
        await plans_repo.upsert(plan.plan_id, plan.model_dump(), id_field="plan_id")
        await goals_repo.update(goal_id, {"active_plan_id": plan.plan_id})

        # 10. Log
        duration_ms = int((time.monotonic() - t0) * 1000)
        log = AgentLog(
            agent_name="planner",
            trace_id=trace_id,
            decision_summary=(
                f"{'Replan' if replan else 'Plan'}: {len(micro_blocks)} blocks over {window_days} days"
            ),
            duration_ms=duration_ms,
        )
        await logs_repo.insert(log.model_dump())

        # 11. Trigger executor for calendar sync
        settings = get_settings()
        await send_message(
            settings.service_bus_queue_executor,
            {"plan_id": plan.plan_id, "user_id": user_id, "action": "sync_calendar"},
        )

        logger.info(
            "Planner completed for goal %s: %d blocks (trace=%s)",
            goal_id, len(micro_blocks), trace_id,
        )
        return plan
