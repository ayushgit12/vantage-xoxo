"""Planner Agent — macro allocation + deterministic micro scheduling.

NO LLM in the core scheduling loop.
Everything is rule-driven with seeded tie-breakers.

Supports global replan: all goals are scheduled together in priority order
so no two goals ever overlap.
"""

import logging
import time
from datetime import datetime, timezone
from uuid import uuid4

from shared.config import get_settings
from shared.models import Plan, GoalKnowledge, AgentLog
from shared.models.goal import GoalType, GoalStatus
from shared.models.user import UserProfile
from shared.db.repositories import (
    goals_repo, knowledge_repo, plans_repo, users_repo,
    constraints_repo, logs_repo,
)
from shared.bus.service_bus import send_message
from shared.telemetry.tracing import get_tracer

from agents.planner.availability import build_availability_matrix, AvailabilityMatrix
from agents.planner.macro_allocator import compute_macro_allocations
from agents.planner.micro_scheduler import schedule_micro_blocks
from agents.planner.habit_scheduler import schedule_habit_blocks

logger = logging.getLogger(__name__)
tracer = get_tracer("planner")

DEFAULT_SEED = 42
PRIORITY_WEIGHT = {"high": 3, "medium": 2, "low": 1}


def _is_schedulable_goal(goal_doc: dict) -> bool:
    """Only active goals should claim future schedule capacity."""
    return goal_doc.get("status", GoalStatus.ACTIVE.value) == GoalStatus.ACTIVE.value


async def run_planner(
    goal_id: str,
    user_id: str,
    window_days: int = 7,
    replan: bool = False,
    trigger_block_id: str | None = None,
) -> Plan:
    """Plan a single goal, then global-replan all goals to avoid overlaps."""

    goal_doc = await goals_repo.find_by_id(goal_id)
    if not goal_doc:
        raise ValueError(f"Goal {goal_id} not found")

    if goal_doc.get("goal_type") == GoalType.HABIT:
        return await _plan_single_habit_goal(goal_doc, user_id, window_days)

    # First ensure this goal has knowledge
    knowledge_doc = await knowledge_repo.find_by_id(goal_id, id_field="goal_id")
    if not knowledge_doc:
        raise ValueError(f"No GoalKnowledge for goal {goal_id}")

    # Run global replan for ALL goals (this goal included)
    plans = await replan_all_goals(user_id, window_days=window_days)

    # Return the plan for the requested goal
    for p in plans:
        if p.goal_id == goal_id:
            return p

    raise ValueError(f"Plan for goal {goal_id} was not generated")


async def _plan_single_habit_goal(goal_doc: dict, user_id: str, window_days: int) -> Plan:
    """Create recurring blocks for habit goals without retriever/macro allocation."""
    from shared.models.goal import Goal

    goal = Goal(**goal_doc)
    blocks = schedule_habit_blocks(goal=goal, window_days=window_days)

    plan = Plan(
        user_id=user_id,
        goal_id=goal.goal_id,
        plan_window_days=window_days,
        seed=DEFAULT_SEED,
        macro_allocations=[],
        micro_blocks=[],
        explanation="Recurring habit schedule generated from inferred preferred schedule",
    )

    # Assign plan_id to all blocks now that we have it
    for block in blocks:
        block.plan_id = plan.plan_id
    plan.micro_blocks = blocks

    await plans_repo.upsert(plan.plan_id, plan.model_dump(mode="json"), id_field="plan_id")
    await goals_repo.update(goal.goal_id, {"active_plan_id": plan.plan_id})
    logger.info("Habit plan generated for %s with %d blocks", goal.goal_id, len(blocks))
    return plan


async def replan_all_goals(
    user_id: str,
    window_days: int = 7,
) -> list[Plan]:
    """Schedule ALL active goals together in priority order.

    This is the core scheduling entrypoint. It:
    1. Builds one shared availability matrix
    2. Sorts goals by priority (high first)
    3. Schedules each goal in order, blocking slots as it goes
    4. Preserves already-done blocks from existing plans
    """
    trace_id = str(uuid4())
    t0 = time.monotonic()

    with tracer.start_as_current_span("planner.replan_all", attributes={"user_id": user_id}):
        # 1. Load user profile
        user_doc = await users_repo.find_by_id(user_id, id_field="user_id")
        user = UserProfile(**user_doc) if user_doc else UserProfile(user_id=user_id)

        # 2. Load time constraints
        constraint_docs = await constraints_repo.find_many({"user_id": user_id})

        # 3. Build shared availability matrix
        availability = build_availability_matrix(
            user=user,
            constraints=constraint_docs,
            window_days=window_days,
        )

        # 4. Load all goals with knowledge, sorted by priority
        all_goals = await goals_repo.find_many({"user_id": user_id})
        goals_with_knowledge = []
        for g in all_goals:
            if not _is_schedulable_goal(g):
                continue
            k_doc = await knowledge_repo.find_by_id(g["goal_id"], id_field="goal_id")
            if k_doc:
                goals_with_knowledge.append((g, GoalKnowledge(**k_doc)))

        # Sort: high priority first, then by deadline (earlier first)
        goals_with_knowledge.sort(key=lambda gk: (
            -PRIORITY_WEIGHT.get(gk[0].get("priority", "medium"), 2),
            gk[0].get("deadline", "9999"),
        ))

        logger.info(
            "Global replan: %d goals with knowledge for user %s",
            len(goals_with_knowledge), user_id,
        )

        # 5. Collect done blocks from existing plans (preserve past work)
        now = datetime.now(timezone.utc)
        done_blocks_by_goal: dict[str, list] = {}
        for goal_doc, _ in goals_with_knowledge:
            plan_id = goal_doc.get("active_plan_id")
            if not plan_id:
                continue
            plan_doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
            if not plan_doc:
                continue
            done = []
            for b in plan_doc.get("micro_blocks", []):
                # Preserve both done AND partial blocks — partial represents real work.
                if b.get("status") in ("done", "partial"):
                    done.append(b)
                    # Block the time slot precisely so no future goal overlaps it.
                    bstart = b.get("start_dt")
                    if isinstance(bstart, str):
                        bstart = datetime.fromisoformat(bstart.replace("Z", "+00:00"))
                    if bstart:
                        dur = b.get("duration_min", 60)
                        availability.block_slot_range(
                            bstart.date(), bstart.hour, bstart.minute, dur
                        )
            done_blocks_by_goal[goal_doc["goal_id"]] = done

        # 5b. Block all active habit-goal blocks so learning sessions never overlap them.
        # Habit goals are excluded from goals_with_knowledge (no GoalKnowledge doc),
        # but their blocks occupy real wall-clock time.
        for g in all_goals:
            if g.get("goal_type") != GoalType.HABIT:
                continue
            if not _is_schedulable_goal(g):
                continue
            h_plan_id = g.get("active_plan_id")
            if not h_plan_id:
                continue
            h_plan_doc = await plans_repo.find_by_id(h_plan_id, id_field="plan_id")
            if not h_plan_doc:
                continue
            for b in h_plan_doc.get("micro_blocks", []):
                bstart = b.get("start_dt")
                if isinstance(bstart, str):
                    bstart = datetime.fromisoformat(bstart.replace("Z", "+00:00"))
                if bstart:
                    availability.block_slot_range(
                        bstart.date(), bstart.hour, bstart.minute, b.get("duration_min", 60)
                    )

        # 6. Schedule each goal in priority order, sharing the availability
        plans: list[Plan] = []
        settings = get_settings()

        for goal_doc, knowledge in goals_with_knowledge:
            goal_id = goal_doc["goal_id"]

            # Compute done/partial minutes per topic from preserved blocks.
            # done   = full credit.  partial = half credit (consistent with frontend).
            done_minutes_for_goal: dict[str, int] = {}
            for b in done_blocks_by_goal.get(goal_id, []):
                tid = b.get("topic_id", "")
                if not tid:
                    continue
                dur = b.get("duration_min", 0)
                if b.get("status") == "done":
                    done_minutes_for_goal[tid] = done_minutes_for_goal.get(tid, 0) + dur
                elif b.get("status") == "partial":
                    done_minutes_for_goal[tid] = done_minutes_for_goal.get(tid, 0) + dur // 2

            # Macro allocation — window-scoped, deducts already-done effort.
            macro = compute_macro_allocations(
                knowledge=knowledge,
                deadline=goal_doc["deadline"],
                target_weekly_effort=goal_doc.get("target_weekly_effort"),
                window_days=window_days,
                done_minutes_per_topic=done_minutes_for_goal,
            )

            # Temporarily block this goal's restricted time slots
            restricted_slots = goal_doc.get("restricted_slots", [])
            temp_blocked: list = []
            for rs in restricted_slots:
                days = rs.get("days", list(range(7)))
                temp_blocked.extend(
                    availability.temporarily_block_recurring(
                        days, rs.get("start_hour", 0), rs.get("end_hour", 0)
                    )
                )

            # Schedule into remaining available slots
            micro_blocks = schedule_micro_blocks(
                knowledge=knowledge,
                macro_allocations=macro,
                availability=availability,
                seed=DEFAULT_SEED,
                max_topics_per_day=user.max_topics_per_day,
                max_daily_minutes=int(user.daily_capacity_hours * 60),
            )

            # Restore temporarily blocked restricted slots so other goals can use them
            AvailabilityMatrix.restore_slots(temp_blocked)

            # Block the just-scheduled slots so the next goal can't use them.
            # Use slot-precise blocking (not integer-hour) to avoid wasting :30 slots.
            for block in micro_blocks:
                availability.block_slot_range(
                    block.start_dt.date(), block.start_dt.hour, block.start_dt.minute, block.duration_min
                )

            # Merge done blocks back in
            from shared.models import MicroBlock
            done_blocks = done_blocks_by_goal.get(goal_id, [])
            done_block_models = [MicroBlock(**b) for b in done_blocks]

            all_blocks = done_block_models + micro_blocks

            # Determine version
            existing_plan_id = goal_doc.get("active_plan_id")
            version = 1
            if existing_plan_id:
                old_plan = await plans_repo.find_by_id(existing_plan_id, id_field="plan_id")
                if old_plan:
                    version = old_plan.get("version", 1) + 1

            plan = Plan(
                user_id=user_id,
                goal_id=goal_id,
                plan_window_days=window_days,
                seed=DEFAULT_SEED,
                macro_allocations=macro,
                micro_blocks=all_blocks,
                version=version,
                # Snapshot knowledge total so the frontend can compute meaningful
                # overall progress without a separate knowledge fetch.
                total_estimated_hours=knowledge.estimated_total_hours,
            )

            # Persist
            await plans_repo.upsert(plan.plan_id, plan.model_dump(mode="json"), id_field="plan_id")
            await goals_repo.update(goal_id, {"active_plan_id": plan.plan_id})
            plans.append(plan)

            logger.info(
                "Scheduled goal %s (%s priority): %d new + %d done blocks",
                goal_id, goal_doc.get("priority", "medium"),
                len(micro_blocks), len(done_blocks),
            )

        # 7. Log
        duration_ms = int((time.monotonic() - t0) * 1000)
        total_blocks = sum(len(p.micro_blocks) for p in plans)
        log = AgentLog(
            agent_name="planner",
            trace_id=trace_id,
            decision_summary=f"Global replan: {len(plans)} goals, {total_blocks} blocks over {window_days} days",
            duration_ms=duration_ms,
        )
        await logs_repo.insert(log.model_dump(mode="json"))

        logger.info(
            "Global replan completed: %d goals, %d total blocks (trace=%s)",
            len(plans), total_blocks, trace_id,
        )
        return plans
