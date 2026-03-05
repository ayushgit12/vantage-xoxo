"""Executor Agent — calendar sync, reminders, status tracking.

NO LLM — pure API calls and status management.
"""

import logging
import time
from uuid import uuid4

from shared.config import get_settings
from shared.models import Plan, AgentLog, MicroBlock
from shared.db.repositories import plans_repo, users_repo, logs_repo
from shared.telemetry.tracing import get_tracer

from agents.executor.calendar_sync import sync_plan_to_calendar
from agents.executor.mock_calendar import mock_sync_plan

logger = logging.getLogger(__name__)
tracer = get_tracer("executor")


async def run_executor(plan_id: str, user_id: str, action: str = "sync_calendar") -> dict:
    """Execute an action for a plan."""
    trace_id = str(uuid4())
    t0 = time.monotonic()

    with tracer.start_as_current_span("executor.run", attributes={"plan_id": plan_id}):
        # Load plan
        plan_doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
        if not plan_doc:
            raise ValueError(f"Plan {plan_id} not found")
        plan = Plan(**plan_doc)

        # Load user
        user_doc = await users_repo.find_by_id(user_id, id_field="user_id")
        settings = get_settings()

        result = {}

        if action == "sync_calendar":
            if settings.use_mock_calendar:
                result = await mock_sync_plan(plan)
            else:
                calendar_id = user_doc.get("calendar_id") if user_doc else None
                result = await sync_plan_to_calendar(plan, user_id, calendar_id)

            # Update plan with external event IDs
            await plans_repo.update(
                plan_id,
                {"micro_blocks": [b.model_dump() for b in plan.micro_blocks]},
                id_field="plan_id",
            )

        # Log
        duration_ms = int((time.monotonic() - t0) * 1000)
        log = AgentLog(
            agent_name="executor",
            trace_id=trace_id,
            decision_summary=f"Action={action}: synced {len(plan.micro_blocks)} blocks",
            duration_ms=duration_ms,
        )
        await logs_repo.insert(log.model_dump())

        logger.info(
            "Executor completed: action=%s, %d blocks (trace=%s)",
            action, len(plan.micro_blocks), trace_id,
        )
        return result
